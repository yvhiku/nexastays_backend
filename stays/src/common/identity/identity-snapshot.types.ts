export interface IdentitySnapshot {
  userId: string;
  unifiedIdentityId: string | null;
  kycStatus: string;
  kycLevel: number;
  kycTier: string;
  kycProvider: string | null;
  updatedAt: string | null;
}
