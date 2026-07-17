import { HostOnboardingService } from './host-onboarding.service';
import { StaysHostProfile } from '../entities/stays-host-profile.entity';
import type { StaysUserContext } from './host-onboarding.types';

describe('HostOnboardingService', () => {
  let service: HostOnboardingService;
  let hostProfileRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    count: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let dataSource: { query: jest.Mock; transaction: jest.Mock };
  let kycPolicy: { meetsHostIdentityReuse: jest.Mock };

  const consumerUser: StaysUserContext = {
    userId: 'consumer-1',
    account_type: 'CONSUMER',
    unified_identity_id: 'identity-1',
    phone_number: '+212612345678',
    email: 'host@test.com',
  };

  const existingProfile = {
    id: 'profile-1',
    user_id: 'consumer-1',
    application_status: 'PENDING',
    identity_status: 'VERIFIED',
    host_verification_status: 'PENDING',
    source: 'MOBILE',
    submitted_from: 'MOBILE_BECOME_HOST',
    listing_frozen: false,
    submitted_at: new Date(),
    rejection_reason: null,
  } as StaysHostProfile;

  beforeEach(() => {
    hostProfileRepo = {
      findOne: jest.fn(),
      create: jest.fn((x) => x as StaysHostProfile),
      save: jest.fn(async (x) => ({ ...existingProfile, ...x }) as StaysHostProfile),
      count: jest.fn().mockResolvedValue(2),
      createQueryBuilder: jest.fn(),
    };

    dataSource = {
      query: jest.fn().mockResolvedValue([]),
      transaction: jest.fn(),
    };
    kycPolicy = { meetsHostIdentityReuse: jest.fn().mockReturnValue(true) };

    service = new HostOnboardingService(
      hostProfileRepo as never,
      { create: jest.fn((x) => x), save: jest.fn() } as never,
      dataSource as never,
      kycPolicy as never,
    );
  });

  it('submitHostOnboarding returns existing pending profile without duplicate save', async () => {
    hostProfileRepo.findOne!.mockResolvedValue(existingProfile);

    const result = await service.submitHostOnboarding(
      consumerUser,
      { hosting_policies_accepted: true, use_existing_kyc: true },
      {
        source: 'MOBILE',
        submitted_from: 'MOBILE_BECOME_HOST',
        requirePolicies: true,
      },
    );

    expect(result.application_status).toBe('PENDING');
    expect(hostProfileRepo.save).not.toHaveBeenCalled();
  });

  it('countPendingApplications uses application_status PENDING', async () => {
    await service.countPendingApplications();
    expect(hostProfileRepo.count).toHaveBeenCalledWith({
      where: { application_status: 'PENDING' },
    });
  });

  it('canList is false until application approved', async () => {
    hostProfileRepo.findOne!.mockResolvedValue({
      ...existingProfile,
      application_status: 'PENDING',
      host_verification_status: 'PENDING',
    });
    await expect(service.canList('consumer-1')).resolves.toBe(false);
  });

  it('canList is true when application and verification approved', async () => {
    hostProfileRepo.findOne!.mockResolvedValue({
      ...existingProfile,
      application_status: 'APPROVED',
      host_verification_status: 'APPROVED',
    });
    await expect(service.canList('consumer-1')).resolves.toBe(true);
  });
});
