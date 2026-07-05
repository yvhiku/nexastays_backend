import type { IdentitySnapshot } from '../../../common/identity/identity-snapshot.types';

export type StaysUserContext = {
  userId: string;
  unified_identity_id?: string;
  phone_number?: string;
  email?: string;
  account_type?: string;
  identitySnapshot?: IdentitySnapshot | null;
};

export type HostApplicationStatus =
  | 'NOT_STARTED'
  | 'DRAFT'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED';

export type HostIdentityStatus =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'VERIFIED'
  | 'REJECTED'
  | 'FAILED'
  | 'NOT_REQUIRED';

export type HostOnboardingSource = 'WEB' | 'MOBILE' | 'ADMIN' | 'UNKNOWN';

export const HOST_ONBOARDING_SOURCES: HostOnboardingSource[] = [
  'WEB',
  'MOBILE',
  'ADMIN',
  'UNKNOWN',
];
