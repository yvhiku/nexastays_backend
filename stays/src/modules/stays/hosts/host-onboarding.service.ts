import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StaysHostProfile } from '../entities/stays-host-profile.entity';
import { StaysAuditLog } from '../entities/stays-audit-log.entity';
import { normalizePhoneOrThrow } from '../../../common/phone/phone-normalizer';
import type { SubmitHostOnboardingDto } from '../dto/submit-host-onboarding.dto';
import type {
  HostApplicationStatus,
  HostIdentityStatus,
  HostOnboardingSource,
  StaysUserContext,
} from './host-onboarding.types';
import { StaysKycPolicyService } from '../../../common/identity/stays-kyc-policy.service';

export type SubmitHostOnboardingContext = {
  source: HostOnboardingSource;
  submitted_from: string;
  requirePolicies?: boolean;
};

@Injectable()
export class HostOnboardingService {
  constructor(
    @InjectRepository(StaysHostProfile)
    private readonly hostProfileRepo: Repository<StaysHostProfile>,
    @InjectRepository(StaysAuditLog)
    private readonly auditRepo: Repository<StaysAuditLog>,
    private readonly dataSource: DataSource,
    private readonly kycPolicy: StaysKycPolicyService,
  ) {}

  private isIdentityVerified(user: StaysUserContext): boolean {
    return this.kycPolicy.meetsHostIdentityReuse(user.identitySnapshot);
  }

  async submitHostOnboarding(
    user: StaysUserContext,
    dto: SubmitHostOnboardingDto,
    context: SubmitHostOnboardingContext,
  ) {
    if (!this.isIdentityVerified(user)) {
      const hasDocuments = !!(
        dto.document_front_asset_id?.trim() && dto.selfie_asset_id?.trim()
      );
      const useExisting = dto.use_existing_kyc === true;
      if (useExisting || !hasDocuments) {
        throw new ForbiddenException(
          'Identity verification required. Complete KYC in Nexa Identity or upload ID documents.',
        );
      }
    }

    if (context.requirePolicies && dto.hosting_policies_accepted !== true) {
      throw new BadRequestException(
        'You must accept hosting policies to apply',
      );
    }

    let profile = await this.hostProfileRepo.findOne({
      where: { user_id: user.userId },
    });

    if (
      profile?.application_status === 'PENDING' ||
      profile?.application_status === 'APPROVED'
    ) {
      if (profile.application_status === 'APPROVED') {
        throw new ConflictException('You already have an approved host account');
      }
      return this.toSubmitResponse(profile);
    }

    if (!profile) {
      profile = this.hostProfileRepo.create({
        user_id: user.userId,
        application_status: 'DRAFT',
        identity_status: 'VERIFIED',
        host_verification_status: 'PENDING',
        source: context.source,
        submitted_from: context.submitted_from,
        identity_reused: true,
      });
    }

    const phone = dto.phone ?? user.phone_number ?? null;
    if (!phone?.trim()) {
      throw new BadRequestException(
        'A verified phone number is required to submit host onboarding',
      );
    }

    profile.full_name = dto.full_name ?? profile.full_name;
    profile.email = dto.email ?? user.email ?? profile.email;
    profile.phone = normalizePhoneOrThrow(phone);
    profile.city = dto.city ?? profile.city;
    profile.host_type = dto.host_type ?? profile.host_type;
    profile.source = context.source;
    profile.submitted_from = context.submitted_from;
    profile.document_type = dto.document_type ?? profile.document_type;
    profile.document_number_hash =
      dto.document_number_hash ?? profile.document_number_hash;
    profile.document_front_asset_id =
      dto.document_front_asset_id ?? profile.document_front_asset_id;
    profile.document_back_asset_id =
      dto.document_back_asset_id ?? profile.document_back_asset_id;
    profile.selfie_asset_id = dto.selfie_asset_id ?? profile.selfie_asset_id;

    const useExistingKyc = dto.use_existing_kyc === true && this.isIdentityVerified(user);
    if (useExistingKyc) {
      profile.identity_status = 'VERIFIED';
      profile.identity_reused = true;
    } else if (dto.document_front_asset_id && dto.selfie_asset_id) {
      profile.identity_status = this.isIdentityVerified(user) ? 'VERIFIED' : 'PENDING';
      profile.identity_reused = false;
    } else {
      profile.identity_status = 'VERIFIED';
      profile.identity_reused = dto.identity_reused ?? true;
    }

    if (dto.hosting_policies_accepted === true) {
      profile.hosting_policies_accepted_at = new Date();
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

  async getHostMe(user: StaysUserContext) {
    const profile = await this.hostProfileRepo.findOne({
      where: { user_id: user.userId },
    });

    const isHost = profile?.application_status === 'APPROVED';
    const canCreateListing =
      profile?.application_status === 'APPROVED' && !profile?.listing_frozen;

    return {
      is_host: isHost,
      host_user_id: isHost ? user.userId : null,
      profile_id: profile?.id ?? null,
      application_status: profile?.application_status ?? 'NOT_STARTED',
      identity_status:
        profile?.identity_status ??
        (this.isIdentityVerified(user) ? 'VERIFIED' : 'NOT_STARTED'),
      host_verification_status:
        profile?.host_verification_status ?? 'NOT_STARTED',
      can_create_listing: canCreateListing,
      can_publish_listing: canCreateListing,
      rejection_reason: profile?.rejection_reason ?? null,
      submitted_at: profile?.submitted_at ?? null,
      reviewed_at: profile?.reviewed_at ?? null,
      source: profile?.source ?? null,
      submitted_from: profile?.submitted_from ?? null,
      kyc_verified: this.isIdentityVerified(user),
      identity_snapshot: user.identitySnapshot ?? null,
    };
  }

  async getLegacyApplicationStatus(userId: string) {
    const profile = await this.hostProfileRepo.findOne({
      where: { user_id: userId },
    });
    if (!profile) return null;
    return {
      id: profile.id,
      status:
        profile.application_status === 'PENDING'
          ? 'PENDING'
          : profile.application_status,
      identity_status: profile.identity_status,
      host_verification_status: profile.host_verification_status,
      submitted_at: profile.submitted_at,
      reviewed_at: profile.reviewed_at,
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
      host_user_id: profile.user_id,
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

  async findProfileByLegacyApplicationId(
    applicationId: string,
  ): Promise<StaysHostProfile | null> {
    const row = await this.dataSource.query(
      `SELECT applicant_user_id FROM host_applications WHERE id = $1 LIMIT 1`,
      [applicationId],
    );
    const applicantId = row?.[0]?.applicant_user_id as string | undefined;
    if (!applicantId) return null;
    return this.hostProfileRepo.findOne({ where: { user_id: applicantId } });
  }

  async approveLegacyApplication(applicationId: string, reviewedBy: string) {
    const profile = await this.findProfileByLegacyApplicationId(applicationId);
    if (!profile) {
      throw new NotFoundException(
        'No host profile found for this application. Resubmit onboarding.',
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

  async resolveProfileForUser(userId: string) {
    return this.hostProfileRepo.findOne({ where: { user_id: userId } });
  }

  async isApprovedHost(userId: string): Promise<boolean> {
    const profile = await this.resolveProfileForUser(userId);
    return profile?.application_status === 'APPROVED';
  }

  async canList(userId: string): Promise<boolean> {
    const profile = await this.resolveProfileForUser(userId);
    return (
      profile?.application_status === 'APPROVED' &&
      profile?.host_verification_status === 'APPROVED' &&
      !profile?.listing_frozen
    );
  }

  private toSubmitResponse(profile: StaysHostProfile) {
    return {
      id: profile.id,
      application_status: profile.application_status as HostApplicationStatus,
      identity_status: profile.identity_status as HostIdentityStatus,
      status: profile.application_status,
      message: 'Host onboarding status retrieved',
    };
  }
}
