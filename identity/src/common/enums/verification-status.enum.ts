/**
 * Status domains for KYC and onboarding.
 * See: backend/docs/kyc-onboarding-status-domains.md
 */

/** Person-level identity verification (UnifiedIdentity). */
export const IDENTITY_VERIFICATION_STATUS = [
  'NOT_STARTED',
  'PENDING',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
] as const;
export type IdentityVerificationStatus = (typeof IDENTITY_VERIFICATION_STATUS)[number];

/** Reusable verification artifact (ReusableIdentityVerification). */
export const VERIFICATION_ARTIFACT_STATUS = [
  'NOT_STARTED',
  'PENDING',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
] as const;
export type VerificationArtifactStatus = (typeof VERIFICATION_ARTIFACT_STATUS)[number];

/** Operational account status (User, service accounts). */
export const SERVICE_ACCOUNT_STATUS = [
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'REJECTED',
  'DISABLED',
  'FROZEN',
  'DELETION_PENDING',
] as const;
export type ServiceAccountStatus = (typeof SERVICE_ACCOUNT_STATUS)[number];

/** Role/service onboarding (host applications, driver/courier registration). */
export const ONBOARDING_STATUS = [
  'APPLICATION_SUBMITTED',
  'DOCUMENTS_REQUIRED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUS)[number];

/** Legacy kyc_status values (users, kyc_profiles). Map to new enums where used. */
export const LEGACY_KYC_STATUS = ['PENDING', 'APPROVED', 'VERIFIED', 'REJECTED', 'NONE'] as const;

/** Map legacy kyc_status to identity_verification_status. */
export function toIdentityVerificationStatus(
  legacy: string | null | undefined,
): IdentityVerificationStatus {
  const u = (legacy ?? 'PENDING').toUpperCase();
  if (u === 'APPROVED' || u === 'VERIFIED') return 'APPROVED';
  if (u === 'REJECTED') return 'REJECTED';
  if (u === 'EXPIRED') return 'EXPIRED';
  if (u === 'UNDER_REVIEW' || u === 'SUBMITTED') return 'UNDER_REVIEW';
  if (u === 'NONE' || u === '') return 'NOT_STARTED';
  return 'PENDING';
}

/** Map identity_verification_status to legacy kyc_status (for backward compat). */
export function toLegacyKycStatus(
  status: IdentityVerificationStatus,
): 'PENDING' | 'APPROVED' | 'VERIFIED' | 'REJECTED' {
  if (status === 'APPROVED') return 'VERIFIED'; // prefer VERIFIED for reusable
  if (status === 'REJECTED') return 'REJECTED';
  return 'PENDING';
}
