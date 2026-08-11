import { NotFoundException } from '@nestjs/common';
import { HostListingsService } from './host-listings.service';
import { HostsService } from '../hosts/hosts.service';

/**
 * H17 — prove resume/update/media/units cannot bypass canList,
 * and cross-host access does not enumerate listings (NotFound).
 */
describe('HostListingsService H17 authorization', () => {
  let service: HostListingsService;
  let hostsService: {
    canList: jest.Mock;
    getHostProfileOrNull: jest.Mock;
  };
  let listingRepo: { findOne: jest.Mock; save: jest.Mock };

  beforeEach(() => {
    hostsService = {
      canList: jest.fn(),
      getHostProfileOrNull: jest.fn(),
    };
    listingRepo = { findOne: jest.fn(), save: jest.fn() };

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

  it('resumeListing DENY when canList is false (frozen/unverified) — no LIVE transition', async () => {
    hostsService.canList.mockResolvedValue(false);
    hostsService.getHostProfileOrNull.mockResolvedValue({ listing_frozen: true });

    await expect(service.resumeListing('host-1', 'listing-1')).rejects.toThrow(
      /temporarily frozen/i,
    );
    expect(listingRepo.findOne).not.toHaveBeenCalled();
    expect(listingRepo.save).not.toHaveBeenCalled();
  });

  it('updateListing DENY when canList is false before ownership load', async () => {
    hostsService.canList.mockResolvedValue(false);
    hostsService.getHostProfileOrNull.mockResolvedValue({ listing_frozen: false });

    await expect(
      service.updateListing('host-1', 'listing-1', {} as never),
    ).rejects.toBeInstanceOf(Error);
    expect(hostsService.canList).toHaveBeenCalledWith('host-1');
    expect(listingRepo.findOne).not.toHaveBeenCalled();
  });

  it('replaceListingMedia DENY when canList is false', async () => {
    hostsService.canList.mockResolvedValue(false);
    hostsService.getHostProfileOrNull.mockResolvedValue({});

    await expect(
      service.replaceListingMedia('host-1', 'listing-1', { media: [] }),
    ).rejects.toBeInstanceOf(Error);
    expect(listingRepo.findOne).not.toHaveBeenCalled();
  });

  it('cross-host pause returns NotFound (anti-enumeration)', async () => {
    hostsService.canList.mockResolvedValue(true);
    listingRepo.findOne.mockResolvedValue({
      id: 'listing-b',
      host_user_id: 'host-b',
      status: 'LIVE',
    });

    await expect(service.pauseListing('host-a', 'listing-b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('resumeListing ALLOW path calls canList then ownership', async () => {
    hostsService.canList.mockResolvedValue(true);
    listingRepo.findOne.mockResolvedValue({
      id: 'listing-1',
      host_user_id: 'host-1',
      status: 'PAUSED',
    });
    listingRepo.save.mockImplementation(async (row) => row);

    const result = await service.resumeListing('host-1', 'listing-1');
    expect(result.status).toBe('LIVE');
    expect(hostsService.canList).toHaveBeenCalledWith('host-1');
  });
});
