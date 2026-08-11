import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { HostListingsService } from './host-listings.service';
import { HostsService } from '../hosts/hosts.service';

/**
 * H15 — prove listing create/submit cannot bypass HostsService.canList
 * (which must encode the onboarding eligibility triad).
 */
describe('HostListingsService assertCanList (H15)', () => {
  let service: HostListingsService;
  let hostsService: {
    canList: jest.Mock;
    getHostProfileOrNull: jest.Mock;
  };
  let listingRepo: { findOne: jest.Mock };

  beforeEach(() => {
    hostsService = {
      canList: jest.fn(),
      getHostProfileOrNull: jest.fn(),
    };
    listingRepo = { findOne: jest.fn() };

    service = new HostListingsService(
      {} as never,
      hostsService as unknown as HostsService,
      {} as never,
      listingRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('createListing DENY when canList is false (unverified) — no DB transaction', async () => {
    hostsService.canList.mockResolvedValue(false);
    hostsService.getHostProfileOrNull.mockResolvedValue({
      application_status: 'APPROVED',
      host_verification_status: 'PENDING',
      listing_frozen: false,
    });

    await expect(
      service.createListing('host-1', { listing_type: 'APARTMENT' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(hostsService.canList).toHaveBeenCalledWith('host-1');
  });

  it('createListing DENY when listing_frozen with frozen-specific message', async () => {
    hostsService.canList.mockResolvedValue(false);
    hostsService.getHostProfileOrNull.mockResolvedValue({
      application_status: 'APPROVED',
      host_verification_status: 'APPROVED',
      listing_frozen: true,
    });

    await expect(
      service.createListing('host-1', { listing_type: 'APARTMENT' } as never),
    ).rejects.toThrow(/temporarily frozen/i);
  });

  it('submitListing DENY when canList is false before ownership load completes mutation path', async () => {
    hostsService.canList.mockResolvedValue(false);
    hostsService.getHostProfileOrNull.mockResolvedValue({
      listing_frozen: false,
    });

    await expect(service.submitListing('host-1', 'listing-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(hostsService.canList).toHaveBeenCalledWith('host-1');
    expect(listingRepo.findOne).not.toHaveBeenCalled();
  });

  it('requireOwnedListing path: Host A cannot mutate Host B listing (ForbiddenException)', async () => {
    listingRepo.findOne.mockResolvedValue({
      id: 'listing-b',
      host_user_id: 'host-b',
      status: 'LIVE',
    });

    await expect(service.pauseListing('host-a', 'listing-b')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
