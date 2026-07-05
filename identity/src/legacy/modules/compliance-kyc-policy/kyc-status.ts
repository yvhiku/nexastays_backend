/**
 * Canonical KYC lifecycle for Pay money movement (backend source of truth).
 * Legacy: users may still carry APPROVED from older Sumsub sync — treat as VERIFIED.
 */
export const KYC_STATUSES = [
  'UNVERIFIED',
  'PENDING',
  'VERIFIED',
  'REJECTED',
  'UNDER_REVIEW',
  /** @deprecated Prefer VERIFIED; retained for backward compatibility */
  'APPROVED',
] as const;

export type KycStatus = (typeof KYC_STATUSES)[number];

export function normalizeKycStatus(raw: string | null | undefined): string {
  const s = (raw ?? '').trim().toUpperCase();
  if (!s) return 'UNVERIFIED';
  if (s === 'APPROVED') return 'VERIFIED';
  return s;
}

export function isKycVerifiedForMoneyMovement(
  raw: string | null | undefined,
): boolean {
  const n = normalizeKycStatus(raw);
  return n === 'VERIFIED';
}

export function isKycBlockedForMoneyMovement(
  raw: string | null | undefined,
): boolean {
  const n = normalizeKycStatus(raw);
  return n === 'REJECTED';
}

/** Outbound wallet debits require an approved verification state */
export function isKycPendingOrReview(
  raw: string | null | undefined,
): boolean {
  const n = normalizeKycStatus(raw);
  return n === 'PENDING' || n === 'UNDER_REVIEW' || n === 'UNVERIFIED';
}
