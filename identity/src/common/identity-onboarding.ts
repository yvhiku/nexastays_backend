import {
  toIdentityVerificationStatus,
  type IdentityVerificationStatus,
} from './enums/verification-status.enum';

export const IDENTITY_ONBOARDING_NEXT = ['REGISTRATION'] as const;
export type IdentityOnboardingNext = (typeof IDENTITY_ONBOARDING_NEXT)[number];

export interface IdentityOnboardingState {
  required: boolean;
  status: IdentityVerificationStatus;
  next: IdentityOnboardingNext | null;
}

export interface IdentityOnboardingSource {
  kycProfileExists: boolean;
  kycStatus?: string | null;
  /** users.kyc_status when it may differ from kyc_profiles.status (webhook lag). */
  userKycStatus?: string | null;
  identityVerificationStatus?: string | null;
  identityVerified?: boolean;
}

/**
 * Canonical post-auth identity onboarding state.
 *
 * A bare CONSUMER shell defaults to PENDING at the database level, so the
 * absence of a KYC profile is the authoritative NOT_STARTED signal. Once a
 * KYC profile exists, its status is authoritative. Unified Identity remains
 * the fallback for reusable/legacy approved identities without a local row.
 */
export function deriveIdentityOnboardingState(
  source: IdentityOnboardingSource,
): IdentityOnboardingState {
  let status: IdentityVerificationStatus;

  if (source.kycProfileExists) {
    status = toIdentityVerificationStatus(source.kycStatus);
    const identityApproved =
      source.identityVerified ||
      toIdentityVerificationStatus(source.identityVerificationStatus) ===
        'APPROVED';
    const userRowApproved =
      source.userKycStatus != null &&
      toIdentityVerificationStatus(source.userKycStatus) === 'APPROVED';
    // Sumsub/webhook lag can leave kyc_profiles PENDING while unified identity
    // or users.kyc_status is already VERIFIED — returning users must log in.
    if (
      (identityApproved || userRowApproved) &&
      status !== 'REJECTED' &&
      status !== 'EXPIRED'
    ) {
      status = 'APPROVED';
    }
  } else if (
    source.identityVerified ||
    toIdentityVerificationStatus(source.identityVerificationStatus) ===
      'APPROVED' ||
    toIdentityVerificationStatus(source.kycStatus) === 'APPROVED'
  ) {
    status = 'APPROVED';
  } else {
    status = 'NOT_STARTED';
  }

  const required = status !== 'APPROVED';
  return {
    required,
    status,
    next: required ? 'REGISTRATION' : null,
  };
}
