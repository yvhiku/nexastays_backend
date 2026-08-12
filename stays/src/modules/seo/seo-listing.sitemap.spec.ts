import { SeoListingService } from './seo-listing.service';
import type { StaysListing } from '../stays/entities/stays-listing.entity';
import { In } from 'typeorm';

type IdQbMock = {
  select: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  take: jest.Mock;
  getMany: jest.Mock;
};

function eligibleListing(id: string, overrides: Partial<StaysListing> = {}): StaysListing {
  const now = new Date('2026-03-01T12:00:00.000Z');
  return {
    id,
    status: 'LIVE',
    title: 'Bright Apartment Casablanca',
    description:
      'A comfortable apartment near the coast with great light and verified stays quality.',
    review_count: 4,
    avg_rating: 4.5 as unknown as StaysListing['avg_rating'],
    created_at: now,
    updated_at: now,
    media: [
      {
        asset_id: 'photo-1',
        kind: 'PHOTO',
        sort_order: 0,
        is_cover: true,
      } as StaysListing['media'][number],
      {
        asset_id: 'walk-1',
        kind: 'WALKTHROUGH',
        sort_order: 1,
        is_cover: false,
      } as StaysListing['media'][number],
    ],
    ...overrides,
  } as StaysListing;
}

describe('SeoListingService.listIndexableForSitemap', () => {
  let service: SeoListingService;
  let idBatches: Array<Array<{ id: string }>>;
  let listingsById: Map<string, StaysListing>;
  let idQb: IdQbMock;
  let listingRepo: {
    createQueryBuilder: jest.Mock;
    find: jest.Mock;
  };

  beforeEach(() => {
    idBatches = [];
    listingsById = new Map();
    idQb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockImplementation(async () => idBatches.shift() ?? []),
    };
    listingRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(idQb),
      find: jest.fn().mockImplementation(async (opts: { where: { id: ReturnType<typeof In> } }) => {
        const raw = opts.where.id as unknown as { _value?: string[]; value?: string[] };
        const ids = raw._value ?? raw.value ?? [];
        return ids.map((id: string) => listingsById.get(id)).filter(Boolean);
      }),
    };
    service = new SeoListingService(listingRepo as never);
  });

  function seed(listings: StaysListing[]) {
    for (const listing of listings) {
      listingsById.set(listing.id, listing);
    }
    idBatches = [listings.map((l) => ({ id: l.id }))];
  }

  it('A: includes LIVE+indexable listings once per locale', async () => {
    const listing = eligibleListing('11111111-1111-1111-1111-111111111111');
    seed([listing]);

    const entries = await service.listIndexableForSitemap();
    const paths = entries.map((e) => e.path).sort();

    expect(paths).toEqual([
      '/ar/listings/11111111-1111-1111-1111-111111111111',
      '/en/listings/11111111-1111-1111-1111-111111111111',
      '/fr/listings/11111111-1111-1111-1111-111111111111',
    ]);
    expect(entries.every((e) => e.priority === 0.8)).toBe(true);
    expect(entries[0]!.lastmod).toBe('2026-03-01T12:00:00.000Z');
  });

  it('B: excludes LIVE failing quality; only queries LIVE status', async () => {
    const good = eligibleListing('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    const thinLive = eligibleListing('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', {
      title: 'Hi',
      description: 'too short',
      media: [],
    });
    seed([good, thinLive]);

    const entries = await service.listIndexableForSitemap();
    const ids = new Set(entries.map((e) => e.path.split('/').pop()));

    expect(ids).toEqual(new Set(['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']));
    expect(idQb.where).toHaveBeenCalledWith('l.status = :status', {
      status: 'LIVE',
    });
  });

  it('C: enumerates every ID batch until exhaustion (no first-page truncation)', async () => {
    const page1 = Array.from({ length: 250 }, (_, i) =>
      eligibleListing(`a${String(i).padStart(35, '0')}`),
    );
    const page2 = [
      eligibleListing('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
      eligibleListing('cccccccc-cccc-cccc-cccc-cccccccccccc'),
    ];
    for (const listing of [...page1, ...page2]) {
      listingsById.set(listing.id, listing);
    }
    idBatches = [
      page1.map((l) => ({ id: l.id })),
      page2.map((l) => ({ id: l.id })),
    ];

    const entries = await service.listIndexableForSitemap();
    const listingIds = new Set(entries.map((e) => e.path.split('/').pop()));

    expect(listingIds.size).toBe(252);
    expect(entries.length).toBe(252 * 3);
    expect(listingRepo.createQueryBuilder).toHaveBeenCalledTimes(2);
    expect(listingRepo.find).toHaveBeenCalledTimes(2);
    expect(idQb.andWhere).toHaveBeenCalled();
  });

  it('D: produces unique paths only', async () => {
    seed([eligibleListing('ffffffff-ffff-ffff-ffff-ffffffffffff')]);
    const entries = await service.listIndexableForSitemap();
    const paths = entries.map((e) => e.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('E: paths match /{locale}/listings/{uuid} canonical shape', async () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    seed([eligibleListing(id)]);
    const entries = await service.listIndexableForSitemap();
    for (const entry of entries) {
      expect(entry.path).toMatch(/^\/(en|fr|ar)\/listings\/[0-9a-f-]{36}$/);
      expect(entry.locale).toMatch(/^(en|fr|ar)$/);
      expect(entry.path).toContain(id);
    }
  });
});
