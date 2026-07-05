import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { UnifiedIdentity } from './entities/unified-identity.entity';
import { User } from './entities/user.entity';
import { IdentityPhoneNumbersService } from './identity-phone-numbers.service';
import { tryNormalizePhoneNumber, phoneLookupCandidates } from '../../common/phone/phone-normalizer';

export interface UnifiedProfileResult {
  id: string;
  phone_number: string;
  full_name: string | null;
  email: string | null;
  date_of_birth: string | null;
  city: string | null;
  address: string | null;
  kyc_status: string;
  identity_verified: boolean;
  linked_services: string[];
}

@Injectable()
export class UnifiedIdentityService {
  constructor(
    @InjectRepository(UnifiedIdentity)
    private readonly unifiedIdentityRepo: Repository<UnifiedIdentity>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly identityPhoneNumbersService: IdentityPhoneNumbersService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Find unified identity by phone, or create one if none exists.
   * Uses advisory lock to prevent duplicate identities under concurrent requests.
   */
  /**
   * Bootstrap a UnifiedIdentity for email-only ADMIN (no phone). Required for JWT claims
   * and refresh-token rotation consistency.
   */
  async ensureIdentityForAdminUser(userId: string): Promise<string> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'unified_identity_id', 'email', 'full_name'],
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.unified_identity_id) return user.unified_identity_id;

    const identity = this.unifiedIdentityRepo.create({
      phone_number: null,
      email: user.email?.trim()?.toLowerCase() || null,
      full_name: user.full_name ?? null,
      kyc_status: 'APPROVED',
      identity_verification_status: 'APPROVED',
      identity_verified: true,
      account_status: 'ACTIVE',
      linked_services: ['ADMIN'],
    });
    const saved = await this.unifiedIdentityRepo.save(identity);
    await this.userRepository.update(user.id, {
      unified_identity_id: saved.id,
    });
    return saved.id;
  }

  async findOrCreateByPhone(phoneNumber: string): Promise<UnifiedIdentity> {
    const norm = tryNormalizePhoneNumber(phoneNumber) ?? phoneNumber;
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [norm],
      );
      const existing = await this.findIdentityByPhoneOrLegacy(phoneNumber);
      if (existing) {
        await this.linkUsersToIdentity(phoneNumber, existing.id);
        await this.ensurePhoneAttached(existing.id, phoneNumber, manager);
        return existing;
      }
      const candidates = phoneLookupCandidates(phoneNumber);
      const users = await this.userRepository
        .createQueryBuilder('u')
        .select(['u.id', 'u.account_type', 'u.full_name', 'u.email', 'u.date_of_birth', 'u.city', 'u.profile_photo_url', 'u.kyc_status', 'u.status'])
        .where('u.phone_number IN (:...candidates)', { candidates })
        .orderBy("CASE WHEN u.account_type = 'CONSUMER' THEN 0 ELSE 1 END")
        .addOrderBy('u.created_at')
        .getMany();

      if (users.length === 0) {
        const identity = this.unifiedIdentityRepo.create({
          phone_number: phoneNumber,
          kyc_status: 'PENDING',
          identity_verification_status: 'NOT_STARTED',
          account_status: 'ACTIVE',
          linked_services: [],
        });
        const saved = await manager.save(UnifiedIdentity, identity);
        await this.ensurePhoneAttached(saved.id, phoneNumber, manager);
        return saved;
      }

      const consumer = users.find((u) => u.account_type === 'CONSUMER');
      const best = consumer ?? users[0];
      const linkedServices = Array.from(
        new Set(users.map((u) => String(u.account_type ?? 'CONSUMER'))),
      );
      const legacyStatus = (best.kyc_status ?? 'PENDING').toUpperCase();
      const identityVerified =
        legacyStatus === 'APPROVED' || legacyStatus === 'VERIFIED';
      const identity = this.unifiedIdentityRepo.create({
        phone_number: phoneNumber,
        full_name: best.full_name ?? null,
        email: best.email ?? null,
        date_of_birth: best.date_of_birth ?? null,
        city: best.city ?? null,
        profile_photo_url: best.profile_photo_url ?? null,
        identity_verified: identityVerified,
        kyc_status: best.kyc_status ?? 'PENDING',
        identity_verification_status: identityVerified
          ? 'APPROVED'
          : legacyStatus === 'REJECTED'
            ? 'REJECTED'
            : 'PENDING',
        account_status: best.status ?? 'ACTIVE',
        linked_services: linkedServices,
      });
      const saved = await manager.save(UnifiedIdentity, identity);
      await this.linkUsersToIdentity(phoneNumber, saved.id);
      await this.ensurePhoneAttached(saved.id, phoneNumber, manager);
      return saved;
    });
  }

  /**
   * Find identity by phone via identity_phone_numbers, or legacy unified_identities.phone_number.
   */
  private async findIdentityByPhoneOrLegacy(
    phoneNumber: string,
  ): Promise<UnifiedIdentity | null> {
    for (const candidate of phoneLookupCandidates(phoneNumber)) {
      const viaTable = await this.identityPhoneNumbersService.findIdentityByPhone(
        candidate,
      );
      if (viaTable) return viaTable;
      const legacy = await this.unifiedIdentityRepo.findOne({
        where: { phone_number: candidate },
      });
      if (legacy) return legacy;
    }
    return null;
  }

  /**
   * Ensure phone is attached to identity in identity_phone_numbers.
   * @param manager - Optional. Pass when inside a transaction so the identity lookup sees uncommitted rows.
   */
  private async ensurePhoneAttached(
    identityId: string,
    rawPhone: string,
    manager?: EntityManager,
  ): Promise<void> {
    try {
      await this.identityPhoneNumbersService.attachPhoneNumberToIdentity(
        identityId,
        rawPhone,
        { isVerified: true },
        manager,
      );
    } catch (e: any) {
      if (e?.code === '23505' || e?.message?.includes('already linked')) {
        return;
      }
      throw e;
    }
  }

  /**
   * Get unified profile by phone. Returns null if no identity and no users.
   */
  async getProfileByPhone(
    phoneNumber: string,
  ): Promise<UnifiedProfileResult | null> {
    const identity = await this.findIdentityByPhoneOrLegacy(phoneNumber);
    if (identity) {
      const ivStatus = (
        identity.identity_verification_status ?? identity.kyc_status ?? 'PENDING'
      ).toUpperCase();
      const kycStatus =
        ivStatus === 'APPROVED'
          ? 'VERIFIED'
          : ivStatus === 'REJECTED'
            ? 'REJECTED'
            : identity.kyc_status ?? 'PENDING';
      const phone =
        identity.phone_number ??
        (await this.identityPhoneNumbersService.getPrimaryPhone(identity.id)) ??
        phoneNumber;
      return {
        id: identity.id,
        phone_number: phone,
        full_name: identity.full_name ?? null,
        email: identity.email ?? null,
        date_of_birth: identity.date_of_birth
          ? (identity.date_of_birth instanceof Date
              ? identity.date_of_birth.toISOString().slice(0, 10)
              : String(identity.date_of_birth).slice(0, 10))
          : null,
        city: identity.city ?? null,
        address: identity.address ?? null,
        kyc_status: kycStatus,
        identity_verified: identity.identity_verified ?? ivStatus === 'APPROVED',
        linked_services: Array.isArray(identity.linked_services)
          ? identity.linked_services
          : [],
      };
    }
    return null;
  }

  /**
   * Link all users with this phone to the unified identity and refresh linked_services (idempotent).
   */
  private async linkUsersToIdentity(
    phoneNumber: string,
    identityId: string,
  ): Promise<void> {
    const candidates = phoneLookupCandidates(phoneNumber);
    if (candidates.length === 0) return;
    await this.userRepository
      .createQueryBuilder()
      .update(User)
      .set({ unified_identity_id: identityId })
      .where('phone_number IN (:...candidates)', { candidates })
      .andWhere('unified_identity_id IS NULL')
      .execute();

    const users = await this.userRepository
      .createQueryBuilder('u')
      .select(['u.account_type'])
      .where('u.unified_identity_id = :id', { id: identityId })
      .getMany();
    const linkedServices = Array.from(
      new Set(users.map((u) => String(u.account_type ?? 'CONSUMER'))),
    );
    await this.unifiedIdentityRepo.update(identityId, {
      linked_services: linkedServices,
      updated_at: new Date(),
    });
  }

  /**
   * Update identity verification status on unified identity (call when ReusableIdentityVerification is synced).
   * Keeps getNexaProfileByPhone consistent with reusable KYC state.
   * @param identityVerified - true when APPROVED/VERIFIED
   * @param kycStatus - legacy: PENDING, APPROVED, VERIFIED, REJECTED
   */
  async updateKycStatus(
    unifiedIdentityId: string,
    identityVerified: boolean,
    kycStatus: string,
  ): Promise<void> {
    const identityStatus =
      identityVerified && ['APPROVED', 'VERIFIED'].includes((kycStatus ?? '').toUpperCase())
        ? 'APPROVED'
        : (kycStatus ?? 'PENDING').toUpperCase() === 'REJECTED'
          ? 'REJECTED'
          : 'PENDING';
    await this.unifiedIdentityRepo.update(unifiedIdentityId, {
      identity_verified: identityVerified,
      kyc_status: kycStatus,
      identity_verification_status: identityStatus,
      updated_at: new Date(),
    });
  }

  /**
   * Find unified identity by phone (read-only). Returns null if not found.
   * Uses identity_phone_numbers first, then legacy phone_number.
   */
  async findByPhone(phoneNumber: string): Promise<UnifiedIdentity | null> {
    return this.findIdentityByPhoneOrLegacy(phoneNumber);
  }

  /**
   * Find unified identity by id (read-only). Returns null if not found.
   */
  async findById(id: string): Promise<UnifiedIdentity | null> {
    return this.unifiedIdentityRepo.findOne({ where: { id } });
  }

  /**
   * Refresh linked_services on an identity from its attached users.
   */
  async refreshLinkedServices(identityId: string): Promise<void> {
    const users = await this.userRepository.find({
      where: { unified_identity_id: identityId },
      select: ['account_type'],
    });
    const linkedServices = Array.from(
      new Set(users.map((u) => String(u.account_type ?? 'CONSUMER'))),
    );
    await this.unifiedIdentityRepo.update(identityId, {
      linked_services: linkedServices,
      updated_at: new Date(),
    });
  }
}
