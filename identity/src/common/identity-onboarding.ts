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
