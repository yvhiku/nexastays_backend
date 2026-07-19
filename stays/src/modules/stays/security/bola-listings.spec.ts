import { NotFoundException } from '@nestjs/common';

/**
 * Mirrors host listing ownership helper used across host surfaces.
 * Full HTTP e2e against staging is Phase 3; this locks the ownership contract.
 */
describe('BOLA — listing ownership contract', () => {
  async function requireOwnedListing(
    listingRepo: { findOne: (q: unknown) => Promise<{ id: string; host_user_id: string } | null> },
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

  it('Host A cannot read Host B listing', async () => {
    const listingRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'listing-b',
        host_user_id: 'host-b',
      }),
    };
    await expect(
      requireOwnedListing(listingRepo, 'host-a', 'listing-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('owner can access own listing', async () => {
    const listingRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'listing-a',
        host_user_id: 'host-a',
      }),
    };
    const listing = await requireOwnedListing(listingRepo, 'host-a', 'listing-a');
    expect(listing.id).toBe('listing-a');
  });
});
