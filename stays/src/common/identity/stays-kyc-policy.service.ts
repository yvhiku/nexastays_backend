import { Injectable } from '@nestjs/common';
import type { IdentitySnapshot } from './identity-snapshot.types';

/** Stays guest booking: BASIC tier (level 1) with approved/verified status. */
export const STAYS_GUEST_MIN_KYC_LEVEL = 1;

const VERIFIED_STATUSES = new Set(['APPROVED', 'VERIFIED']);

@Injectable()
export class StaysKycPolicyService {
  /**
   * Identity snapshot is the only source for KYC data — never read from JWT.
   */
  meetsGuestBookingPolicy(snapshot: IdentitySnapshot | null | undefined): boolean {
    if (!snapshot) return false;
    return (
      VERIFIED_STATUSES.has(snapshot.kycStatus.toUpperCase()) &&
      snapshot.kycLevel >= STAYS_GUEST_MIN_KYC_LEVEL
    );
  }

  meetsHostIdentityReuse(snapshot: IdentitySnapshot | null | undefined): boolean {
    if (!snapshot) return false;
    return VERIFIED_STATUSES.has(snapshot.kycStatus.toUpperCase());
  }
}
