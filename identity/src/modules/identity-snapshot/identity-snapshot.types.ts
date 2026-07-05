export interface IdentitySnapshot {
  userId: string;
  unifiedIdentityId: string | null;
  kycStatus: string;
  kycLevel: number;
  kycTier: string;
  kycProvider: string | null;
  updatedAt: string | null;
}

export function kycTierToLevel(tierKey: string | null | undefined): number {
  const map: Record<string, number> = {
    NONE: 0,
    BASIC: 1,
    STANDARD: 2,
    FULL: 3,
  };
  if (!tierKey) return 0;
  return map[tierKey.toUpperCase()] ?? 0;
}
