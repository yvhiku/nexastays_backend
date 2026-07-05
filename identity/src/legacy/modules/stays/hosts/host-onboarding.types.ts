export type HostApplicationStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';

export type HostIdentityStatus =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'VERIFIED'
  | 'FAILED'
  | 'NOT_REQUIRED';

export type HostOnboardingSource = 'MOBILE' | 'WEB' | 'ADMIN' | 'UNKNOWN';

export const HOST_ONBOARDING_SOURCES: HostOnboardingSource[] = [
  'MOBILE',
  'WEB',
  'ADMIN',
  'UNKNOWN',
];
