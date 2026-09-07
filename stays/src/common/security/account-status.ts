import { UnauthorizedException } from '@nestjs/common';

/** Account statuses that must block authenticated API access (047). */
export const RESTRICTED_ACCOUNT_STATUSES = new Set([
  'SUSPENDED',
  'FROZEN',
  'BANNED',
]);

export function isRestrictedAccountStatus(status: string | undefined): boolean {
  return RESTRICTED_ACCOUNT_STATUSES.has(String(status ?? '').toUpperCase());
}

export function assertAccountNotRestricted(status: string | undefined): void {
  if (!isRestrictedAccountStatus(status)) return;
  throw new UnauthorizedException('Account access revoked');
}
