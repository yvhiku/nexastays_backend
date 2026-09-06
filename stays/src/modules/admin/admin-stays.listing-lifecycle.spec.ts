import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminStaysService } from './admin-stays.service';

/**
 * Admin listing lifecycle: Freeze / Take Offline (pause), Resume (unpause), Live.
 * Reuses the existing DRAFT|SUBMITTED|APPROVED|REJECTED|LIVE|PAUSED machine —
 * no new statuses — and must respect the host-wide `listing_frozen` flag.
 */
describe('AdminStaysService listing lifecycle (pause / unpause / set-live)', () => {
  let service: AdminStaysService;
  let listingRepo: { findOne: jest.Mock; save: jest.Mock };
  let hostProfileRepo: { findOne: jest.Mock };
  let auditRepo: { create: jest.Mock; save: jest.Mock };
  let domainEvents: { publish: jest.Mock };
  let seoFreshness: { refreshForSearchCity: jest.Mock };

  const listing = (status: string) => ({
    id: 'listing-1',
    host_user_id: 'host-1',
    city: 'Casablanca',
    status,
  });

  beforeEach(() => {
    listingRepo = { findOne: jest.fn(), save: jest.fn(async (l) => l) };
    hostProfileRepo = { findOne: jest.fn().mockResolvedValue({ listing_frozen: false }) };
    auditRepo = { create: jest.fn((row) => row), save: jest.fn(async (row) => row) };
    domainEvents = { publish: jest.fn().mockResolvedValue(undefined) };
    seoFreshness = { refreshForSearchCity: jest.fn().mockResolvedValue(undefined) };

    service = new AdminStaysService(
      listingRepo as never,
      {} as never,
      hostProfileRepo as never,
      auditRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      domainEvents as never,
      seoFreshness as never,
      {} as never,
    );
  });

  describe('pauseListing (Freeze / Take Offline)', () => {
    it.each(['LIVE', 'APPROVED'])('%s -> PAUSED with admin audit', async (from) => {
      listingRepo.findOne.mockResolvedValue(listing(from));
      const result = await service.pauseListing('listing-1', 'admin-1');
      expect(result.status).toBe('PAUSED');
      expect(listingRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'PAUSED' }),
      );
      expect(auditRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LISTING_PAUSED',
          actor_role: 'ADMIN',
          metadata: { previous_status: from },
        }),
      );
    });

    it.each(['DRAFT', 'SUBMITTED', 'REJECTED', 'PAUSED'])(
      'rejects pause from %s (400) without saving',
      async (from) => {
        listingRepo.findOne.mockResolvedValue(listing(from));
        await expect(service.pauseListing('listing-1', 'admin-1')).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(listingRepo.save).not.toHaveBeenCalled();
      },
    );

    it('404 when the listing does not exist', async () => {
      listingRepo.findOne.mockResolvedValue(null);
      await expect(service.pauseListing('nope', 'admin-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('never touches archived_at (pause is not archive)', async () => {
      const row = { ...listing('LIVE'), archived_at: null };
      listingRepo.findOne.mockResolvedValue(row);
      await service.pauseListing('listing-1', 'admin-1');
      expect(row.archived_at).toBeNull();
    });
  });

  describe('unpauseListing (Resume)', () => {
    it('PAUSED -> LIVE, audits, and re-publishes for marketplace visibility', async () => {
      listingRepo.findOne.mockResolvedValue(listing('PAUSED'));
      const result = await service.unpauseListing('listing-1', 'admin-1');
      expect(result.status).toBe('LIVE');
      expect(listingRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'LIVE' }),
      );
      expect(auditRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LISTING_RESUMED', actor_role: 'ADMIN' }),
      );
      expect(domainEvents.publish).toHaveBeenCalled();
      expect(seoFreshness.refreshForSearchCity).toHaveBeenCalledWith('Casablanca');
    });

    it.each(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'LIVE'])(
      'rejects resume from %s (400)',
      async (from) => {
        listingRepo.findOne.mockResolvedValue(listing(from));
        await expect(service.unpauseListing('listing-1', 'admin-1')).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(listingRepo.save).not.toHaveBeenCalled();
      },
    );

    it('is blocked while the host is listing-frozen and does not clear host freeze', async () => {
      listingRepo.findOne.mockResolvedValue(listing('PAUSED'));
      const profile = { listing_frozen: true };
      hostProfileRepo.findOne.mockResolvedValue(profile);
      await expect(service.unpauseListing('listing-1', 'admin-1')).rejects.toThrow(
        /frozen/i,
      );
      expect(profile.listing_frozen).toBe(true);
      expect(listingRepo.save).not.toHaveBeenCalled();
      expect(hostProfileRepo.findOne).toHaveBeenCalledWith({
        where: { user_id: 'host-1' },
      });
    });
  });

  describe('setListingLive (unchanged)', () => {
    it('still only allows APPROVED -> LIVE', async () => {
      listingRepo.findOne.mockResolvedValue(listing('PAUSED'));
      await expect(service.setListingLive('listing-1', 'admin-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      listingRepo.findOne.mockResolvedValue(listing('APPROVED'));
      await expect(service.setListingLive('listing-1', 'admin-1')).resolves.toMatchObject({
        status: 'LIVE',
      });
    });
  });
});
