import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReusableIdentityVerification } from './entities/reusable-identity-verification.entity';
import { KycProfile } from '../compliance/entities/kyc-profile.entity';
import { UnifiedIdentityService } from './unified-identity.service';
import { NexaService, getServicePolicy } from './kyc-reuse-policy';

export interface KycReuseResult {
  useExistingKyc: boolean;
  canSkipIdentityStep: boolean;
  canPrefillIdentityReadonly: boolean;
  requireStepUpVerification: boolean;
  isDocumentExpired: boolean;
  isReusableForService: boolean;
  blockReason: string | null;
  verification: ReusableIdentityVerification | null;
}

@Injectable()
export class KycReuseService {
  constructor(
    @InjectRepository(ReusableIdentityVerification)
    private readonly repo: Repository<ReusableIdentityVerification>,
    private readonly unifiedIdentityService: UnifiedIdentityService,
  ) {}

  /**
   * Whether KYC can be reused for this service. Only APPROVED/VERIFIED, non-expired, policy-allowed.
   */
  isKycReusableForService(
    verification: ReusableIdentityVerification | null,
    service: NexaService,
  ): boolean {
    if (!verification) return false;
    const policy = getServicePolicy(service);
    if (!policy.allowsReuse) return false;
    const isVerified =
      verification.verification_status === 'APPROVED' ||
      verification.kyc_status === 'VERIFIED' ||
      verification.kyc_status === 'APPROVED';
    if (!isVerified) return false;
    if (!verification.identity_verified) return false;
    if (verification.reusable_across_services === false) return false;
    if (verification.reuse_block_reason) return false;
    if (this.isIdentityDocumentExpired(verification)) return false;
    if (policy.minVerificationLevel && verification.verification_level) {
      if (verification.verification_level !== policy.minVerificationLevel) {
        return false;
      }
    }
    if (
      policy.acceptedDocumentTypes?.length &&
      verification.document_type &&
      !policy.acceptedDocumentTypes.includes(verification.document_type)
    ) {
      return false;
    }
    return true;
  }

  /** Document expiry: past expiry_date = expired */
  isIdentityDocumentExpired(
    verification: ReusableIdentityVerification | null,
  ): boolean {
    if (!verification?.expiry_date) return false;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const exp = verification.expiry_date instanceof Date
      ? verification.expiry_date
      : new Date(verification.expiry_date);
    exp.setHours(0, 0, 0, 0);
    return exp < now;
  }

  /**
   * Whether identity verification step can be skipped (reuse existing valid KYC).
   */
  canSkipIdentityStep(
    unifiedIdentityId: string,
    service: NexaService,
  ): Promise<boolean> {
    return this.useExistingKyc(unifiedIdentityId, service).then(
      (r) => r.useExistingKyc,
    );
  }

  /**
   * Can prefill identity fields as read-only (even if step-up required).
   */
  canPrefillIdentityReadonly(service: NexaService): boolean {
    return getServicePolicy(service).canPrefillIdentityReadonly;
  }

  /**
   * Whether this service requires step-up verification (e.g. driver license, vehicle).
   */
  requireStepUpVerification(service: NexaService): boolean {
    return getServicePolicy(service).requiresStepUpVerification;
  }

  /**
   * Main entry: can we use existing KYC for this service?
   * Returns full result for use_existing_kyc, can_skip_identity_step, etc.
   */
  async useExistingKyc(
    unifiedIdentityId: string,
    service: NexaService,
  ): Promise<KycReuseResult> {
    const policy = getServicePolicy(service);
    const verification = await this.repo.findOne({
      where: { unified_identity_id: unifiedIdentityId },
    });

    const isDocumentExpired = this.isIdentityDocumentExpired(verification ?? null);
    const isReusableForService = this.isKycReusableForService(
      verification ?? null,
      service,
    );

    const isVerified =
      verification?.verification_status === 'APPROVED' ||
      verification?.kyc_status === 'VERIFIED' ||
      verification?.kyc_status === 'APPROVED';
    let blockReason: string | null = null;
    if (!verification) {
      blockReason = 'NO_REUSABLE_KYC';
    } else if (!isVerified) {
      blockReason = 'NOT_VERIFIED';
    } else if (verification.reuse_block_reason) {
      blockReason = verification.reuse_block_reason;
    } else if (isDocumentExpired) {
      blockReason = 'EXPIRED';
    } else if (!policy.allowsReuse) {
      blockReason = 'POLICY';
    }

    const useExistingKyc = isReusableForService && !blockReason;
    const canSkipIdentityStep = useExistingKyc && !policy.requiresStepUpVerification;
    const canPrefillIdentityReadonly =
      policy.canPrefillIdentityReadonly &&
      verification != null &&
      isVerified &&
      !isDocumentExpired;

    return {
      useExistingKyc,
      canSkipIdentityStep,
      canPrefillIdentityReadonly,
      requireStepUpVerification: policy.requiresStepUpVerification,
      isDocumentExpired,
      isReusableForService,
      blockReason,
      verification: verification ?? null,
    };
  }

  /**
   * Find reusable verification for unified identity (read-only).
   */
  async findByUnifiedIdentity(
    unifiedIdentityId: string,
  ): Promise<ReusableIdentityVerification | null> {
    return this.repo.findOne({
      where: { unified_identity_id: unifiedIdentityId },
    });
  }

  /**
   * Create or update reusable verification from a verified KycProfile.
   * Called when admin approves KYC or when KYC flow completes.
   */
  async upsertFromKycProfile(params: {
    unifiedIdentityId: string;
    kycProvider: string | null;
    verificationReference: string | null;
    verificationLevel: string | null;
    documentType: string | null;
    documentNumberMasked: string | null;
    expiryDate: Date | null;
    selfieVerified: boolean;
  }): Promise<ReusableIdentityVerification> {
    const now = new Date();
    const existing = await this.repo.findOne({
      where: { unified_identity_id: params.unifiedIdentityId },
    });

    const payload = {
      kyc_provider: params.kycProvider,
      verification_reference: params.verificationReference,
      kyc_status: 'VERIFIED',
      verification_status: 'APPROVED' as const,
      identity_verified: true,
      verification_level: params.verificationLevel,
      document_type: params.documentType,
      document_number_masked: params.documentNumberMasked,
      first_verified_at: existing?.first_verified_at ?? now,
      last_verified_at: now,
      expiry_date: params.expiryDate,
      selfie_verified: params.selfieVerified,
      reusable_across_services: true,
      reuse_block_reason: null,
    };

    if (existing) {
      await this.repo.update(existing.id, payload);
      const updated = await this.repo.findOne({ where: { id: existing.id } });
      if (!updated) throw new Error('ReusableIdentityVerification not found after update');
      return updated;
    }

    const created = this.repo.create({
      unified_identity_id: params.unifiedIdentityId,
      ...payload,
    });
    return this.repo.save(created);
  }

  /**
   * Sync reusable verification from a freshly approved KycProfile.
   * Call after admin approves KYC. Ensures unified identity exists, then upserts.
   */
  async syncFromKycApproval(
    userPhoneNumber: string,
    kyc: KycProfile,
  ): Promise<ReusableIdentityVerification | null> {
    const identity = await this.unifiedIdentityService.findOrCreateByPhone(userPhoneNumber);
    const selfieVerified = Boolean(kyc.documents?.selfie ?? kyc.selfie_url);
    let documentNumberMasked: string | null = null;
    if (kyc.national_id_number) {
      const s = String(kyc.national_id_number);
      documentNumberMasked = s.length > 4 ? `****${s.slice(-4)}` : '****';
    }
    let expiryDate: Date | null = null;
    // KycProfile does not have expiry_date; could be added or derived from document_type
    const reusable = await this.upsertFromKycProfile({
      unifiedIdentityId: identity.id,
      kycProvider: kyc.provider ?? null,
      verificationReference: kyc.reference ?? null,
      verificationLevel: kyc.level ?? null,
      documentType: kyc.document_type ?? null,
      documentNumberMasked,
      expiryDate,
      selfieVerified,
    });
    await this.unifiedIdentityService.updateKycStatus(
      identity.id,
      true,
      'VERIFIED',
    );
    return reusable;
  }

  /**
   * Mark reusable verification as blocked (e.g. document expired, admin revoke).
   */
  async setReuseBlocked(
    unifiedIdentityId: string,
    reason: string,
  ): Promise<void> {
    await this.repo.update(
      { unified_identity_id: unifiedIdentityId },
      {
        reusable_across_services: false,
        reuse_block_reason: reason,
        updated_at: new Date(),
      },
    );
  }
}
