import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StaysHostProfile } from '../entities/stays-host-profile.entity';
import { StaysAuditLog } from '../entities/stays-audit-log.entity';
import { User } from '../../users/entities/user.entity';
import { KycProfile } from '../../compliance/entities/kyc-profile.entity';
import { UsersService } from '../../users/users.service';
import { UnifiedIdentityService } from '../../users/unified-identity.service';
import { normalizePhoneOrThrow } from '../../../common/phone/phone-normalizer';
import type { SubmitHostOnboardingDto } from '../dto/submit-host-onboarding.dto';
import type {
  HostApplicationStatus,
  HostIdentityStatus,
  HostOnboardingSource,
} from './host-onboarding.types';

export type SubmitHostOnboardingContext = {
  source: HostOnboardingSource;
  submitted_from: string;
  requireConsumer?: boolean;
  requirePolicies?: boolean;
};

@Injectable()
export class HostOnboardingService {
  constructor(
    @InjectRepository(StaysHostProfile)
    private readonly hostProfileRepo: Repository<StaysHostProfile>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(KycProfile)
    private readonly kycRepo: Repository<KycProfile>,
    @InjectRepository(StaysAuditLog)
    private readonly auditRepo: Repository<StaysAuditLog>,
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    private readonly unifiedIdentityService: UnifiedIdentityService,
  ) {}

  async submitHostOnboarding(
    userId: string,
    dto: SubmitHostOnboardingDto,
    context: SubmitHostOnboardingContext,
  ): Promise<{
    id: string;
    application_status: HostApplicationStatus;
    identity_status: HostIdentityStatus;
    status: string;
    message: string;
  }> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (context.requireConsumer && user.account_type !== 'CONSUMER') {
      throw new BadRequestException(
        'Host onboarding must be submitted from a CONSUMER account.',
      );
    }

    if (
      context.requirePolicies &&
      dto.hosting_policies_accepted !== true
    ) {
      throw new BadRequestException(
        'You must accept hosting policies to apply',
      );
    }

    const identity = user.unified_identity_id
      ? await this.unifiedIdentityService.findById(user.unified_identity_id)
      : null;
    if (!identity) {
      throw new BadRequestException(
        'Your account is not linked to an identity. Complete registration first.',
      );
    }

    const existingHost = await this.usersService.findByUnifiedIdentityIdAndAccountType(
      identity.id,
      'HOST',
    );
    if (existingHost) {
      const hostProfile = await this.hostProfileRepo.findOne({
        where: { user_id: existingHost.id },
      });
      if (hostProfile?.application_status === 'APPROVED') {
        throw new ConflictException('You already have an approved host account');
      }
    }

    let profile = await this.findProfileForApplicant(userId, identity.id);

    if (
      profile?.application_status === 'PENDING' ||
      profile?.application_status === 'APPROVED'
    ) {
      if (profile.application_status === 'APPROVED') {
        throw new ConflictException('Your host application was already approved');
      }
      return this.toSubmitResponse(profile);
    }

    if (!profile) {
      profile = this.hostProfileRepo.create({
        user_id: userId,
        application_status: 'DRAFT',
        identity_status: 'NOT_STARTED',
        host_verification_status: 'PENDING',
        source: context.source,
        submitted_from: context.submitted_from,
      });
    }

    const phone =
      dto.phone ??
      identity.phone_number ??
      user.phone_number ??
      null;
    if (!phone?.trim()) {
      throw new BadRequestException(
        'A verified phone number is required to submit host onboarding',
      );
    }

    profile.full_name =
      dto.full_name ?? user.full_name ?? identity.full_name ?? profile.full_name;
    profile.email = dto.email ?? user.email ?? identity.email ?? profile.email;
    profile.phone = normalizePhoneOrThrow(phone);
    profile.city = dto.city ?? profile.city;
    profile.host_type = dto.host_type ?? profile.host_type;
    profile.source = context.source;
    profile.submitted_from = context.submitted_from;
    profile.sumsub_applicant_id =
      dto.sumsub_applicant_id ?? profile.sumsub_applicant_id;
    profile.identity_reused =
      dto.identity_reused === true ||
      dto.use_existing_kyc === true ||
      profile.identity_reused;

    if (dto.hosting_policies_accepted === true) {
      profile.hosting_policies_accepted_at = new Date();
    }

    if (dto.use_existing_kyc) {
      await this.applyExistingKycToProfile(userId, profile);
    } else if (
      dto.document_type ||
      dto.document_front_asset_id ||
      dto.selfie_asset_id
    ) {
      profile.document_type = dto.document_type || profile.document_type || 'CNIE';
      profile.document_number_hash =
        dto.document_number_hash ?? profile.document_number_hash;
      profile.document_front_asset_id =
        dto.document_front_asset_id ?? profile.document_front_asset_id;
      profile.document_back_asset_id =
        dto.document_back_asset_id ?? profile.document_back_asset_id;
      profile.selfie_asset_id = dto.selfie_asset_id ?? profile.selfie_asset_id;
      profile.identity_status = dto.identity_status ?? 'PENDING';
    } else if (dto.identity_status) {
      profile.identity_status = dto.identity_status;
    }

    profile.application_status = 'PENDING';
    profile.host_verification_status = 'PENDING';
    profile.submitted_at = new Date();
    profile.reviewed_at = null;
    profile.reviewed_by = null;
    profile.rejection_reason = null;

    const saved = await this.hostProfileRepo.save(profile);
    return {
      ...this.toSubmitResponse(saved),
      message:
        'Host onboarding submitted. Your application will be reviewed shortly.',
    };
  }

  private async applyExistingKycToProfile(
    userId: string,
    profile: StaysHostProfile,
  ): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const kycStatus = (user.kyc_status || '').toUpperCase();
    if (kycStatus !== 'APPROVED' && kycStatus !== 'VERIFIED') {
      throw new BadRequestException(
        'Your identity must be verified first. Complete KYC verification before applying as a host.',
      );
    }

    const kyc = await this.kycRepo.findOne({ where: { user_id: userId } });
    if (!kyc) {
      throw new BadRequestException(
        'No identity verification found. Please complete KYC first.',
      );
    }

    const kycProfileStatus = (kyc.status || '').toUpperCase();
    if (
      kycProfileStatus !== 'APPROVED' &&
      kycProfileStatus !== 'VERIFIED'
    ) {
      throw new BadRequestException(
        'Your identity must be fully approved before applying as a host.',
      );
    }

    profile.document_type = kyc.document_type || profile.document_type;
    profile.document_number_hash =
      kyc.national_id_number_hash || profile.document_number_hash;
    profile.identity_status = 'VERIFIED';
    profile.identity_reused = true;
    profile.reviewed_by = null;
  }

  async getHostMe(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const profile = await this.resolveProfileForUser(userId);
    const hostUser =
      user.account_type === 'HOST'
        ? user
        : user.unified_identity_id
          ? await this.usersService.findByUnifiedIdentityIdAndAccountType(
              user.unified_identity_id,
              'HOST',
            )
          : null;

    const isHost = hostUser != null && profile?.application_status === 'APPROVED';
    const applicationStatus =
      profile?.application_status ?? 'NOT_STARTED';
    const identityStatus = profile?.identity_status ?? 'NOT_STARTED';
    const canCreateListing =
      profile?.application_status === 'APPROVED' && !profile?.listing_frozen;
    const canPublishListing = canCreateListing;

    return {
      is_host: isHost,
      host_user_id: hostUser?.id ?? null,
      profile_id: profile?.id ?? null,
      application_status: applicationStatus,
      identity_status: identityStatus,
      host_verification_status: profile?.host_verification_status ?? 'NOT_STARTED',
      can_create_listing: canCreateListing,
      can_publish_listing: canPublishListing,
      rejection_reason: profile?.rejection_reason ?? null,
      submitted_at: profile?.submitted_at ?? null,
      reviewed_at: profile?.reviewed_at ?? null,
      source: profile?.source ?? null,
      submitted_from: profile?.submitted_from ?? null,
    };
  }

  async getLegacyApplicationStatus(userId: string) {
    const profile = await this.findProfileForApplicant(
      userId,
      (await this.usersService.findById(userId))?.unified_identity_id ?? '',
    );
    if (!profile) return null;
    return {
      id: profile.id,
      status:
        profile.application_status === 'PENDING'
          ? 'PENDING'
          : profile.application_status,
      rejection_reason: profile.rejection_reason,
    };
  }

  async getVerificationStatus(userId: string) {
    const profile = await this.resolveProfileForUser(userId);
    if (!profile) {
      return {
        status: 'NOT_STARTED',
        application_status: 'NOT_STARTED',
        identity_status: 'NOT_STARTED',
        message:
          'Host verification required to publish listings. Submit your host onboarding to get approved.',
      };
    }

    return {
      status: profile.host_verification_status,
      application_status: profile.application_status,
      identity_status: profile.identity_status,
      submitted_at: profile.submitted_at,
      reviewed_at: profile.reviewed_at,
      rejection_reason: profile.rejection_reason,
    };
  }

  async listForAdmin(params?: {
    application_status?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const { application_status, status, limit = 50, offset = 0 } = params || {};
    const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 500);
    const safeOffset = Math.max(0, Number(offset) || 0);
    const qb = this.hostProfileRepo
      .createQueryBuilder('hp')
      .leftJoinAndSelect('hp.user', 'user')
      .orderBy('hp.submitted_at', 'DESC', 'NULLS LAST')
      .addOrderBy('hp.created_at', 'DESC')
      .take(safeLimit)
      .skip(safeOffset);

    const appStatus = application_status ?? status;
    if (appStatus && appStatus !== 'all') {
      if (appStatus === 'UNDER_REVIEW') {
        qb.andWhere('hp.application_status = :pending', { pending: 'PENDING' });
      } else {
        qb.andWhere('hp.application_status = :appStatus', { appStatus });
      }
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async approve(
    profileId: string,
    reviewedBy: string,
    auditContext?: { ip?: string; userAgent?: string },
  ) {
    const profile = await this.dataSource.transaction(async (manager) => {
      const locked = await manager
        .getRepository(StaysHostProfile)
        .createQueryBuilder('hp')
        .where('hp.id = :id', { id: profileId })
        .setLock('pessimistic_write')
        .getOne();
      if (!locked) {
        throw new NotFoundException('Host profile not found');
      }
      if (
        locked.application_status !== 'PENDING' &&
        locked.application_status !== 'DRAFT'
      ) {
        throw new BadRequestException(
          `Cannot approve host onboarding with status ${locked.application_status}`,
        );
      }
      locked.application_status = 'APPROVED';
      locked.host_verification_status = 'APPROVED';
      locked.reviewed_at = new Date();
      locked.reviewed_by = reviewedBy;
      locked.rejection_reason = null;
      await manager.save(StaysHostProfile, locked);
      return locked;
    });

    const applicant = await this.usersService.findById(profile.user_id);
    if (!applicant) {
      throw new NotFoundException('Applicant user not found');
    }

    const phone = normalizePhoneOrThrow(
      profile.phone ?? applicant.phone_number ?? '',
    );
    const identity = applicant.unified_identity_id
      ? await this.unifiedIdentityService.findById(applicant.unified_identity_id)
      : await this.unifiedIdentityService.findOrCreateByPhone(phone);
    if (!identity) {
      throw new BadRequestException('Unified identity not found for host approval');
    }

    await this.usersService.findOrCreateForKyc(
      phone,
      profile.full_name ?? applicant.full_name ?? undefined,
    );

    const hostUser = await this.usersService.ensureRoleAccount({
      phone_number: phone,
      account_type: 'HOST',
      unified_identity_id: identity.id,
      full_name: profile.full_name ?? applicant.full_name ?? undefined,
    });

    if (profile.user_id !== hostUser.id) {
      profile.user_id = hostUser.id;
      await this.hostProfileRepo.save(profile);
    }

    await this.auditRepo.save(
      this.auditRepo.create({
        actor_user_id: reviewedBy,
        actor_role: 'ADMIN',
        entity_type: 'HOST_PROFILE',
        entity_id: profileId,
        action: 'HOST_ONBOARDING_APPROVED',
        metadata: { source: profile.source, submitted_from: profile.submitted_from },
        ip: auditContext?.ip ?? null,
        user_agent: auditContext?.userAgent ?? null,
      }),
    );

    return {
      id: profile.id,
      status: 'APPROVED',
      application_status: 'APPROVED',
      host_user_id: hostUser.id,
      message: 'Host approved',
    };
  }

  async reject(
    profileId: string,
    reason: string,
    reviewedBy: string,
    auditContext?: { ip?: string; userAgent?: string },
  ) {
    const profile = await this.hostProfileRepo.findOne({
      where: { id: profileId },
    });
    if (!profile) {
      throw new NotFoundException('Host profile not found');
    }
    if (
      profile.application_status !== 'PENDING' &&
      profile.application_status !== 'DRAFT'
    ) {
      throw new BadRequestException(
        `Cannot reject host onboarding with status ${profile.application_status}`,
      );
    }

    profile.application_status = 'REJECTED';
    profile.host_verification_status = 'REJECTED';
    profile.reviewed_at = new Date();
    profile.reviewed_by = reviewedBy;
    profile.rejection_reason = reason || 'Rejected by admin';
    await this.hostProfileRepo.save(profile);

    await this.auditRepo.save(
      this.auditRepo.create({
        actor_user_id: reviewedBy,
        actor_role: 'ADMIN',
        entity_type: 'HOST_PROFILE',
        entity_id: profileId,
        action: 'HOST_ONBOARDING_REJECTED',
        metadata: { reason },
        ip: auditContext?.ip ?? null,
        user_agent: auditContext?.userAgent ?? null,
      }),
    );

    return {
      id: profile.id,
      status: 'REJECTED',
      application_status: 'REJECTED',
      message: 'Host rejected',
    };
  }

  /** Resolve profile from legacy host_applications.id. */
  async findProfileByLegacyApplicationId(
    applicationId: string,
  ): Promise<StaysHostProfile | null> {
    const row = await this.dataSource.query(
      `SELECT applicant_user_id FROM host_applications WHERE id = $1 LIMIT 1`,
      [applicationId],
    );
    const applicantId = row?.[0]?.applicant_user_id as string | undefined;
    if (!applicantId) return null;
    const user = await this.usersService.findById(applicantId);
    return this.findProfileForApplicant(
      applicantId,
      user?.unified_identity_id ?? '',
    );
  }

  /** Approve by legacy host_applications.id (compat wrapper). */
  async approveLegacyApplication(applicationId: string, reviewedBy: string) {
    const profile = await this.findProfileByLegacyApplicationId(applicationId);
    if (!profile) {
      throw new NotFoundException(
        'No host profile found for this application. Run migration 049 or resubmit onboarding.',
      );
    }
    return this.approve(profile.id, reviewedBy);
  }

  async rejectLegacyApplication(
    applicationId: string,
    reason: string,
    reviewedBy: string,
  ) {
    const profile = await this.findProfileByLegacyApplicationId(applicationId);
    if (!profile) {
      throw new NotFoundException('No host profile found for this application');
    }
    return this.reject(profile.id, reason, reviewedBy);
  }

  async countPendingApplications(): Promise<number> {
    return this.hostProfileRepo.count({
      where: { application_status: 'PENDING' },
    });
  }

  async resolveProfileForUser(userId: string): Promise<StaysHostProfile | null> {
    const user = await this.usersService.findById(userId);
    if (!user) return null;
    return this.findProfileForApplicant(
      userId,
      user.unified_identity_id ?? '',
    );
  }

  async canList(userId: string): Promise<boolean> {
    const profile = await this.resolveProfileForUser(userId);
    return (
      profile?.application_status === 'APPROVED' &&
      profile?.host_verification_status === 'APPROVED' &&
      !profile?.listing_frozen
    );
  }

  private async findProfileForApplicant(
    userId: string,
    unifiedIdentityId: string,
  ): Promise<StaysHostProfile | null> {
    const direct = await this.hostProfileRepo.findOne({
      where: { user_id: userId },
    });
    if (direct) return direct;

    if (!unifiedIdentityId) return null;

    const hostUser = await this.usersService.findByUnifiedIdentityIdAndAccountType(
      unifiedIdentityId,
      'HOST',
    );
    if (hostUser) {
      return this.hostProfileRepo.findOne({
        where: { user_id: hostUser.id },
      });
    }
    return null;
  }

  private toSubmitResponse(profile: StaysHostProfile) {
    return {
      id: profile.id,
      application_status: profile.application_status,
      identity_status: profile.identity_status,
      status: profile.application_status,
      message: 'Host onboarding is pending review',
    };
  }
}
