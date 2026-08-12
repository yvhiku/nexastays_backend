import { HostListingsService } from './host-listings.service';
import { HostsService } from '../hosts/hosts.service';
import { encodeHostListCursor } from '../utils/host-list-cursor.util';

type ListingRow = {
  id: string;
  host_user_id: string;
  title: string;
  city: string;
  status: string;
  listing_type: string;
  booking_model: string;
  country: string;
  created_at: Date;
  updated_at: Date;
  last_edited_at: Date | null;
  archived_at: null;
  description: string | null;
  checkin_time: string | null;
  checkout_time: string | null;
  instant_booking: boolean;
  property_details: Record<string, unknown>;
  safety_features: Record<string, unknown>;
  policies: Record<string, unknown>;
  neighborhood: null;
  postal_code: null;
  building_name: null;
  landmark: null;
  address_encrypted: null;
  geo_lat: null;
  geo_lng: null;
  rate_plan: { base_price: number; weekend_price: null; currency: string } | null;
  media: Array<{
    asset_id: string;
    kind: string;
    sort_order: number;
    is_cover: boolean;
    category: null;
    unit_type_id: null;
  }>;
  rules: null;
  unit_types: never[];
};

/**
 * Regression: pagination must be over distinct listings, not listing×media rows.
 * Fixture: 105 listings × 3 media each; limit=20.
 */
describe('HostListingsService listHostListingsPage (multi-media pagination)', () => {
  const hostId = 'host-multi-media';
  const TOTAL = 105;
  const MEDIA_PER = 3;
  const LIMIT = 20;

  let service: HostListingsService;
  let allListings: ListingRow[];
  let listingRepo: {
    createQueryBuilder: jest.Mock;
    find: jest.Mock;
  };

  function makeListing(i: number): ListingRow {
    const id = `listing-${String(i).padStart(3, '0')}`;
    const created = new Date(Date.UTC(2026, 0, 1, 0, 0, i));
    return {
      id,
      host_user_id: hostId,
      title: `Listing ${i}`,
      city: 'Casablanca',
      status: 'LIVE',
      listing_type: 'APARTMENT',
      booking_model: 'ENTIRE_PLACE',
      country: 'MA',
      created_at: created,
      updated_at: created,
      last_edited_at: created,
      archived_at: null,
      description: null,
      checkin_time: null,
      checkout_time: null,
      instant_booking: false,
      property_details: {},
      safety_features: {},
      policies: {},
      neighborhood: null,
      postal_code: null,
      building_name: null,
      landmark: null,
      address_encrypted: null,
      geo_lat: null,
      geo_lng: null,
      rate_plan: { base_price: 100 + i, weekend_price: null, currency: 'MAD' },
      media: Array.from({ length: MEDIA_PER }, (_, m) => ({
        asset_id: `${id}-media-${m}`,
        kind: 'PHOTO',
        sort_order: m,
        is_cover: m === 0,
        category: null,
        unit_type_id: null,
      })),
      rules: null,
      unit_types: [],
    };
  }

  function pageAfterCursor(cursorId: string | null, limitPlus: number) {
    const ordered = [...allListings].sort((a, b) => {
      const c = b.created_at.getTime() - a.created_at.getTime();
      if (c !== 0) return c;
      return b.id.localeCompare(a.id);
    });
    let start = 0;
    if (cursorId) {
      const idx = ordered.findIndex((l) => l.id === cursorId);
      start = idx < 0 ? ordered.length : idx + 1;
    }
    return ordered.slice(start, start + limitPlus);
  }

  function inValues(idCond: unknown): string[] {
    if (Array.isArray(idCond)) return idCond as string[];
    if (idCond && typeof idCond === 'object') {
      const o = idCond as { _value?: string[]; value?: string[] };
      if (Array.isArray(o._value)) return o._value;
      if (Array.isArray(o.value)) return o.value;
    }
    return [];
  }

  beforeEach(() => {
    allListings = Array.from({ length: TOTAL }, (_, i) => makeListing(i));
    listingRepo = {
      createQueryBuilder: jest.fn(),
      find: jest.fn(),
    };

    listingRepo.createQueryBuilder.mockImplementation(() => {
      let cursorId: string | null = null;
      const qb: Record<string, jest.Mock> = {};
      const chain = () => qb;
      for (const m of [
        'where',
        'leftJoin',
        'addSelect',
        'orderBy',
        'addOrderBy',
        'take',
      ]) {
        qb[m] = jest.fn(chain);
      }
      qb.andWhere = jest.fn((_sql: string, params?: { cId?: string }) => {
        if (params?.cId) cursorId = String(params.cId);
        return qb;
      });
      qb.getRawAndEntities = jest.fn(async () => {
        // Distinct listing LIMIT — NOT listing×media (would be 105*3).
        const slice = pageAfterCursor(cursorId, LIMIT + 1);
        return {
          entities: slice,
          raw: slice.map((l) => ({
            updated_sort: l.last_edited_at,
            price_sort: l.rate_plan?.base_price,
          })),
        };
      });
      return qb;
    });

    listingRepo.find.mockImplementation(
      async (opts: { where: { id: unknown; host_user_id: string } }) => {
        const ids = inValues(opts.where.id);
        return allListings.filter((l) => ids.includes(l.id));
      },
    );

    service = new HostListingsService(
      {} as never,
      {} as unknown as HostsService,
      {} as never,
      listingRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('walks all cursors: every listing once, page size ≤20, has_next until final', async () => {
    const seen = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;

    while (true) {
      const page = await service.listHostListingsPage(hostId, {
        limit: LIMIT,
        cursor,
        sort: 'default',
        status: 'all',
      });

      pages += 1;
      expect(page.items.length).toBeLessThanOrEqual(LIMIT);
      for (const item of page.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
        expect(item.media.length).toBeLessThanOrEqual(1);
      }

      if (!page.pagination.has_next) {
        expect(page.pagination.next_cursor).toBeNull();
        break;
      }
      expect(page.items.length).toBe(LIMIT);
      expect(page.pagination.next_cursor).toBeTruthy();
      cursor = page.pagination.next_cursor!;
    }

    expect(seen.size).toBe(TOTAL);
    expect(pages).toBe(Math.ceil(TOTAL / LIMIT));
  });

  it('rejects cursor from another host context before querying', async () => {
    const foreign = encodeHostListCursor(
      {
        kind: 'listings',
        hostId: 'other-host',
        sort: 'default',
        filter: '',
        search: '',
        listingId: '',
        status: 'all',
      },
      { created_at: new Date().toISOString() },
      'listing-000',
    );

    await expect(
      service.listHostListingsPage(hostId, {
        limit: LIMIT,
        cursor: foreign,
        sort: 'default',
      }),
    ).rejects.toThrow(/cursor/i);
    expect(listingRepo.createQueryBuilder).not.toHaveBeenCalled();
  });
});
