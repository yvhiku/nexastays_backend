import { deriveIdentityOnboardingState } from './identity-onboarding';

describe('deriveIdentityOnboardingState', () => {
  it('treats a bare consumer shell as not started', () => {
    expect(
      deriveIdentityOnboardingState({
        kycProfileExists: false,
        kycStatus: 'PENDING',
      }),
    ).toEqual({
      required: true,
      status: 'NOT_STARTED',
      next: 'REGISTRATION',
    });
  });

  it.each([
    ['PENDING', 'PENDING'],
    ['UNDER_REVIEW', 'UNDER_REVIEW'],
    ['REJECTED', 'REJECTED'],
    ['EXPIRED', 'EXPIRED'],
  ] as const)('keeps persisted %s KYC in onboarding', (kycStatus, status) => {
    expect(
      deriveIdentityOnboardingState({
        kycProfileExists: true,
        kycStatus,
      }),
    ).toEqual({
      required: true,
      status,
      next: 'REGISTRATION',
    });
  });

  it.each(['APPROVED', 'VERIFIED'] as const)(
    'marks persisted %s KYC complete',
    (kycStatus) => {
      expect(
        deriveIdentityOnboardingState({
          kycProfileExists: true,
          kycStatus,
        }),
      ).toEqual({
        required: false,
        status: 'APPROVED',
        next: null,
      });
    },
  );

  it('honors reusable approved Unified Identity without a local KYC row', () => {
    expect(
      deriveIdentityOnboardingState({
        kycProfileExists: false,
        identityVerificationStatus: 'APPROVED',
        identityVerified: true,
      }),
    ).toEqual({
      required: false,
      status: 'APPROVED',
      next: null,
    });
  });
});
