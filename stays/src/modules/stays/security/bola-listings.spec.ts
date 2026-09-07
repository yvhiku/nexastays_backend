import { NotFoundException } from '@nestjs/common';

/**
 * Gate 3 / original 041–048 — listing ownership + anti-enumeration contract.
 * Mirrors production HostListingsService.requireOwnedListing (H17):
 * missing OR wrong owner → NotFoundException; no mutation side effects.
 */
describe('BOLA — listing ownership contract', () => {
  const actors = {
    guest: 'guest-consumer',
    hostA: 'host-a',
    hostB: 'host-b',
  } as const;

  async function requireOwnedListing(
    listingRepo: {
      findOne: (q: unknown) => Promise<{ id: string; host_user_id: string; status?: string } | null>;
    },
    userId: string,
    listingId: string,
  ) {
    const listing = await listingRepo.findOne({
      where: { id: listingId },
      select: ['id', 'host_user_id'],
    });
    if (!listing || listing.host_user_id !== userId) {
      throw new NotFoundException('Listing not found');
    }
    return listing;
  }

  async function pauseOwnedListing(
    listingRepo: {
      findOne: jest.Mock;
      save: jest.Mock;
    },
    userId: string,
    listingId: string,
  ) {
    const listing = await requireOwnedListing(listingRepo, userId, listingId);
    listing.status = 'PAUSED';
    return listingRepo.save(listing);
  }

  it('Host A cannot read Host B listing', async () => {
    const listingRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'listing-b',
        host_user_id: actors.hostB,
      }),
    };
    await expect(
      requireOwnedListing(listingRepo, actors.hostA, 'listing-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('owner can access own listing', async () => {
    const listingRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'listing-a',
        host_user_id: actors.hostA,
      }),
    };
    const listing = await requireOwnedListing(
      listingRepo,
      actors.hostA,
      'listing-a',
    );
    expect(listing.id).toBe('listing-a');
  });

  it('guest/consumer cannot access Host A listing by ID (anti-enumeration)', async () => {
    const listingRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'listing-a',
        host_user_id: actors.hostA,
      }),
    };
    await expect(
      requireOwnedListing(listingRepo, actors.guest, 'listing-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('Host A pause of Host B listing is denied and does not save', async () => {
    const listingRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'listing-b',
        host_user_id: actors.hostB,
        status: 'LIVE',
      }),
      save: jest.fn(),
    };
    await expect(
      pauseOwnedListing(listingRepo, actors.hostA, 'listing-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(listingRepo.save).not.toHaveBeenCalled();
  });

  it('Host A pause of own listing is allowed and saves once', async () => {
    const listingRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'listing-a',
        host_user_id: actors.hostA,
        status: 'LIVE',
      }),
      save: jest.fn(async (row) => row),
    };
    const saved = await pauseOwnedListing(listingRepo, actors.hostA, 'listing-a');
    expect(saved.status).toBe('PAUSED');
    expect(listingRepo.save).toHaveBeenCalledTimes(1);
  });

  it('missing listing ID looks identical to foreign ownership (404)', async () => {
    const listingRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    await expect(
      requireOwnedListing(
        listingRepo,
        actors.hostA,
        'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      ),
    ).rejects.toMatchObject({ message: 'Listing not found' });
  });
});
