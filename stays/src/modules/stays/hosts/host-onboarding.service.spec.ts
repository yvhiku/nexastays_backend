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
      { resolveFirstExisting: jest.fn() } as never,
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

  it('canList is true when application and verification approved and not frozen', async () => {
    hostProfileRepo.findOne!.mockResolvedValue({
      ...existingProfile,
      application_status: 'APPROVED',
      host_verification_status: 'APPROVED',
      listing_frozen: false,
    });
    await expect(service.canList('consumer-1')).resolves.toBe(true);
  });

  it('canList DENY when listing_frozen even if application+verification APPROVED', async () => {
    hostProfileRepo.findOne!.mockResolvedValue({
      ...existingProfile,
      application_status: 'APPROVED',
      host_verification_status: 'APPROVED',
      listing_frozen: true,
    });
    await expect(service.canList('consumer-1')).resolves.toBe(false);
  });

  it('canList DENY when application APPROVED but host_verification PENDING', async () => {
    hostProfileRepo.findOne!.mockResolvedValue({
      ...existingProfile,
      application_status: 'APPROVED',
      host_verification_status: 'PENDING',
      listing_frozen: false,
    });
    await expect(service.canList('consumer-1')).resolves.toBe(false);
  });

  it('canList DENY when application APPROVED but host_verification REJECTED', async () => {
    hostProfileRepo.findOne!.mockResolvedValue({
      ...existingProfile,
      application_status: 'APPROVED',
      host_verification_status: 'REJECTED',
      listing_frozen: false,
    });
    await expect(service.canList('consumer-1')).resolves.toBe(false);
  });

  it('canList DENY when application REJECTED even if verification appears APPROVED', async () => {
    hostProfileRepo.findOne!.mockResolvedValue({
      ...existingProfile,
      application_status: 'REJECTED',
      host_verification_status: 'APPROVED',
      listing_frozen: false,
    });
    await expect(service.canList('consumer-1')).resolves.toBe(false);
  });

  it('canList DENY when application DRAFT', async () => {
    hostProfileRepo.findOne!.mockResolvedValue({
      ...existingProfile,
      application_status: 'DRAFT',
      host_verification_status: 'PENDING',
      listing_frozen: false,
    });
    await expect(service.canList('consumer-1')).resolves.toBe(false);
  });

  it('canList DENY when no host profile exists', async () => {
    hostProfileRepo.findOne!.mockResolvedValue(null);
    await expect(service.canList('unknown-user')).resolves.toBe(false);
  });

  it('isApprovedHost is application APPROVED only (weaker than canList)', async () => {
    hostProfileRepo.findOne!.mockResolvedValue({
      ...existingProfile,
      application_status: 'APPROVED',
      host_verification_status: 'PENDING',
      listing_frozen: true,
    });
    await expect(service.isApprovedHost('consumer-1')).resolves.toBe(true);
    await expect(service.canList('consumer-1')).resolves.toBe(false);
  });

  it('getHostMe can_create_listing / can_publish_listing match canList triad', async () => {
    hostProfileRepo.findOne!.mockResolvedValue({
      ...existingProfile,
      application_status: 'APPROVED',
      host_verification_status: 'PENDING',
      listing_frozen: false,
    });
    const weaker = await service.getHostMe(consumerUser);
    expect(weaker.can_create_listing).toBe(false);
    expect(weaker.can_publish_listing).toBe(false);

    hostProfileRepo.findOne!.mockResolvedValue({
      ...existingProfile,
      application_status: 'APPROVED',
      host_verification_status: 'APPROVED',
      listing_frozen: false,
    });
    const ok = await service.getHostMe(consumerUser);
    expect(ok.can_create_listing).toBe(true);
    expect(ok.can_publish_listing).toBe(true);

    hostProfileRepo.findOne!.mockResolvedValue({
      ...existingProfile,
      application_status: 'APPROVED',
      host_verification_status: 'APPROVED',
      listing_frozen: true,
    });
    const frozen = await service.getHostMe(consumerUser);
    expect(frozen.can_create_listing).toBe(false);
    expect(frozen.can_publish_listing).toBe(false);
  });

  it('listForAdmin omits document_number_hash and sumsub_applicant_id', async () => {
    const qb = {
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([
        [
          {
            ...existingProfile,
            document_number_hash: 'should-not-leak',
            sumsub_applicant_id: 'sumsub-secret',
            document_front_asset_id: 'asset-front',
          },
        ],
        1,
      ]),
    };
    hostProfileRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.listForAdmin();
    expect(result.total).toBe(1);
    expect(result.items[0]).not.toHaveProperty('document_number_hash');
    expect(result.items[0]).not.toHaveProperty('sumsub_applicant_id');
    expect(result.items[0].user_id).toBe('consumer-1');
    expect(result.items[0].document_front_asset_id).toBe('asset-front');
  });
});
