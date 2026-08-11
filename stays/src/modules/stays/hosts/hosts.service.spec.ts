import { HostsService } from './hosts.service';
import { HostOnboardingService } from './host-onboarding.service';

describe('HostsService.canList (H15 authorization)', () => {
  let service: HostsService;
  let hostOnboarding: {
    isApprovedHost: jest.Mock;
    canList: jest.Mock;
    resolveProfileForUser: jest.Mock;
  };

  beforeEach(() => {
    hostOnboarding = {
      isApprovedHost: jest.fn(),
      canList: jest.fn(),
      resolveProfileForUser: jest.fn(),
    };
    service = new HostsService(
      {} as never,
      hostOnboarding as unknown as HostOnboardingService,
      {} as never,
    );
  });

  it('delegates to HostOnboardingService.canList, not isApprovedHost', async () => {
    hostOnboarding.canList.mockResolvedValue(true);
    hostOnboarding.isApprovedHost.mockResolvedValue(true);

    await expect(service.canList('host-1')).resolves.toBe(true);

    expect(hostOnboarding.canList).toHaveBeenCalledWith('host-1');
    expect(hostOnboarding.isApprovedHost).not.toHaveBeenCalled();
  });

  it('returns false when onboarding canList denies (does not widen via isApprovedHost)', async () => {
    hostOnboarding.canList.mockResolvedValue(false);
    hostOnboarding.isApprovedHost.mockResolvedValue(true);

    await expect(service.canList('frozen-or-unverified')).resolves.toBe(false);
    expect(hostOnboarding.canList).toHaveBeenCalledWith('frozen-or-unverified');
    expect(hostOnboarding.isApprovedHost).not.toHaveBeenCalled();
  });

  it('isHostVerified remains application-approval check (not listing eligibility)', async () => {
    hostOnboarding.isApprovedHost.mockResolvedValue(true);
    await expect(service.isHostVerified('host-1')).resolves.toBe(true);
    expect(hostOnboarding.isApprovedHost).toHaveBeenCalledWith('host-1');
    expect(hostOnboarding.canList).not.toHaveBeenCalled();
  });
});
