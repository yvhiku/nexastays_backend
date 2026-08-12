import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { StaysBooking } from '../entities/stays-booking.entity';
import { StaysListing } from '../entities/stays-listing.entity';
import { getDashboardNow } from './host-dashboard-timezone';
import {
  encodeHostListCursor,
  decodeHostListCursor,
} from '../utils/host-list-cursor.util';
import {
  applyHostBookingFilterSql,
  escapeIlikePattern,
  guestDisplayNameSql,
  opsUrgencyRankSql,
} from '../utils/host-bookings-list-sql.util';
import type {
  HostBookingFilterParam,
  HostBookingSortParam,
  HostBookingsListQueryDto,
  HostBookingsCountsQueryDto,
} from '../dto/host-bookings-list.dto';

export type HostBookingListItem = Record<string, unknown>;

@Injectable()
export class HostBookingsListService {
  constructor(
    @InjectRepository(StaysBooking)
    private readonly bookingRepo: Repository<StaysBooking>,
  ) {}

  async listHostBookingsPage(
    hostUserId: string,
    query: HostBookingsListQueryDto,
    mapItem: (booking: StaysBooking) => HostBookingListItem,
  ) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const filter: HostBookingFilterParam = query.filter ?? 'all';
    const sort: HostBookingSortParam = query.sort ?? 'ops';
    const search = (query.search ?? '').trim();
    const listingId = query.listing_id ?? '';
    const now = getDashboardNow();
    const today = now.today;
    const tomorrow = now.tomorrow;

    const ctx = {
      kind: 'bookings' as const,
      hostId: hostUserId,
      sort,
      filter,
      search: search.toLowerCase(),
      listingId,
      status: '',
    };

    const cursorPayload = decodeHostListCursor(query.cursor, ctx);

    const qb = this.baseQb(hostUserId);
    this.applyScope(qb, { listingId, search, today, tomorrow, filter });

    const rankSql = opsUrgencyRankSql('b');
    const guestSql = guestDisplayNameSql('b');
    qb.addSelect(rankSql, 'ops_rank');
    // Lowercased guest name for ORDER BY / keyset (matches client localeCompare base)
    qb.addSelect(`LOWER(COALESCE(${guestSql}, ''))`, 'guest_sort_name');

    this.applyOrder(qb, sort);
    this.applyKeyset(qb, sort, cursorPayload, rankSql);

    qb.take(limit + 1);

    const { entities, raw } = await qb.getRawAndEntities();
    const hasNext = entities.length > limit;
    const pageEntities = hasNext ? entities.slice(0, limit) : entities;
    const pageRaw = hasNext ? raw.slice(0, limit) : raw;

    const items = pageEntities.map(mapItem);

    let nextCursor: string | null = null;
    if (hasNext && pageEntities.length > 0) {
      const last = pageEntities[pageEntities.length - 1];
      const lastRaw = pageRaw[pageRaw.length - 1] as Record<string, unknown>;
      const keys = this.cursorKeys(sort, last, lastRaw);
      nextCursor = encodeHostListCursor(ctx, keys, last.id);
    }

    return {
      items,
      pagination: {
        limit,
        has_next: hasNext,
        next_cursor: nextCursor,
      },
    };
  }

  private rawField(
    raw: Record<string, unknown>,
    name: string,
  ): unknown {
    if (name in raw) return raw[name];
    const hit = Object.keys(raw).find((k) => k === name || k.endsWith('_' + name));
    return hit ? raw[hit] : undefined;
  }

  async getHostBookingsCounts(
    hostUserId: string,
    query: HostBookingsCountsQueryDto,
  ) {
    const search = (query.search ?? '').trim();
    const listingId = query.listing_id ?? '';
    const now = getDashboardNow();
    const today = now.today;
    const tomorrow = now.tomorrow;

    const filters: HostBookingFilterParam[] = [
      'all',
      'today',
      'checkin_today',
      'checkout_today',
      'upcoming',
      'current',
      'awaiting_payment',
      'completed',
      'cancelled',
    ];

    const counts: Record<string, number> = {};
    for (const filter of filters) {
      const qb = this.bookingRepo
        .createQueryBuilder('b')
        .innerJoin('b.listing', 'listing')
        .where('listing.host_user_id = :hostUserId', { hostUserId });
      this.applyScope(qb, {
        listingId,
        search,
        today,
        tomorrow,
        filter,
      });
      counts[filter] = await qb.getCount();
    }
    return counts;
  }

  private baseQb(hostUserId: string): SelectQueryBuilder<StaysBooking> {
    return this.bookingRepo
      .createQueryBuilder('b')
      .innerJoinAndSelect('b.listing', 'listing')
      .leftJoinAndSelect('b.occupants', 'occupants')
      .where('listing.host_user_id = :hostUserId', { hostUserId });
  }

  private applyScope(
    qb: SelectQueryBuilder<StaysBooking>,
    opts: {
      listingId: string;
      search: string;
      today: string;
      tomorrow: string;
      filter: HostBookingFilterParam;
    },
  ) {
    qb.setParameter('today', opts.today);
    qb.setParameter('tomorrow', opts.tomorrow);

    if (opts.listingId) {
      qb.andWhere('b.listing_id = :listingId', { listingId: opts.listingId });
    }

    const filterSql = applyHostBookingFilterSql(opts.filter, 'b');
    if (filterSql) {
      qb.andWhere(filterSql);
    }

    if (opts.search) {
      const pattern = `%${escapeIlikePattern(opts.search.toLowerCase())}%`;
      const guestSql = guestDisplayNameSql('b');
      qb.andWhere(
        `(
          LOWER(COALESCE(${guestSql}, '')) LIKE :searchPattern ESCAPE '\\'
          OR LOWER(COALESCE(listing.title, '')) LIKE :searchPattern ESCAPE '\\'
          OR LOWER(b.id::text) LIKE :searchPattern ESCAPE '\\'
          OR LOWER(COALESCE(b.booking_reference, '')) LIKE :searchPattern ESCAPE '\\'
          OR LOWER(b.listing_id::text) LIKE :searchPattern ESCAPE '\\'
        )`,
        { searchPattern: pattern },
      );
    }
  }

  private applyOrder(
    qb: SelectQueryBuilder<StaysBooking>,
    sort: HostBookingSortParam,
  ) {
    if (sort === 'ops') {
      // Sort by selected alias (see addSelect ops_rank)
      qb.orderBy('ops_rank', 'ASC');
      qb.addOrderBy('b.checkin_date', 'ASC');
      qb.addOrderBy('b.id', 'ASC');
      return;
    }
    if (sort === 'checkin') {
      qb.orderBy('b.checkin_date', 'ASC');
      qb.addOrderBy('b.id', 'ASC');
      return;
    }
    if (sort === 'checkout') {
      qb.orderBy('b.checkout_date', 'ASC');
      qb.addOrderBy('b.id', 'ASC');
      return;
    }
    if (sort === 'amount') {
      // total_subtotal NOT NULL in schema
      qb.orderBy('b.total_subtotal', 'ASC');
      qb.addOrderBy('b.id', 'ASC');
      return;
    }
    if (sort === 'guest') {
      // Client uses (guest_name ?? "").trim() ASC — empty/null first
      qb.orderBy('guest_sort_name', 'ASC');
      qb.addOrderBy('b.id', 'ASC');
    }
  }

  private applyKeyset(
    qb: SelectQueryBuilder<StaysBooking>,
    sort: HostBookingSortParam,
    cursor: ReturnType<typeof decodeHostListCursor>,
    rankSql: string,
  ) {
    if (!cursor) return;
    const k = cursor.keys;
    const id = cursor.id;

    if (sort === 'ops') {
      qb.andWhere(
        `(
          (${rankSql}) > :cRank
          OR ((${rankSql}) = :cRank AND b.checkin_date > CAST(:cCheckin AS date))
          OR ((${rankSql}) = :cRank AND b.checkin_date = CAST(:cCheckin AS date) AND b.id > :cId)
        )`,
        {
          cRank: Number(k.ops_rank),
          cCheckin: String(k.checkin_date),
          cId: id,
        },
      );
      return;
    }
    if (sort === 'checkin') {
      qb.andWhere(
        `(
          b.checkin_date > CAST(:cCheckin AS date)
          OR (b.checkin_date = CAST(:cCheckin AS date) AND b.id > :cId)
        )`,
        { cCheckin: String(k.checkin_date), cId: id },
      );
      return;
    }
    if (sort === 'checkout') {
      qb.andWhere(
        `(
          b.checkout_date > CAST(:cCheckout AS date)
          OR (b.checkout_date = CAST(:cCheckout AS date) AND b.id > :cId)
        )`,
        { cCheckout: String(k.checkout_date), cId: id },
      );
      return;
    }
    if (sort === 'amount') {
      qb.andWhere(
        `(
          b.total_subtotal > :cAmount
          OR (b.total_subtotal = :cAmount AND b.id > :cId)
        )`,
        { cAmount: Number(k.total_subtotal), cId: id },
      );
      return;
    }
    if (sort === 'guest') {
      const guestSql = guestDisplayNameSql('b');
      qb.andWhere(
        `(
          LOWER(COALESCE(${guestSql}, '')) > :cGuest
          OR (LOWER(COALESCE(${guestSql}, '')) = :cGuest AND b.id > :cId)
        )`,
        {
          cGuest: String(k.guest_sort_name ?? '').toLowerCase(),
          cId: id,
        },
      );
    }
  }

  private cursorKeys(
    sort: HostBookingSortParam,
    booking: StaysBooking,
    raw: Record<string, unknown>,
  ): Record<string, string | number | null> {
    const ymd = (v: Date | string) => {
      if (typeof v === 'string') return v.slice(0, 10);
      return v.toISOString().slice(0, 10);
    };
    if (sort === 'ops') {
      return {
        ops_rank: Number(this.rawField(raw, 'ops_rank') ?? 8),
        checkin_date: ymd(booking.checkin_date),
      };
    }
    if (sort === 'checkin') {
      return { checkin_date: ymd(booking.checkin_date) };
    }
    if (sort === 'checkout') {
      return { checkout_date: ymd(booking.checkout_date) };
    }
    if (sort === 'amount') {
      return { total_subtotal: Number(booking.total_subtotal) };
    }
    return {
      guest_sort_name: String(
        this.rawField(raw, 'guest_sort_name') ?? '',
      ).toLowerCase(),
    };
  }
}

/** Slim listing embed for host booking list (no media / check_in_contact). */
export function toSlimHostBookingListing(listing: StaysListing | undefined) {
  if (!listing) return null;
  return {
    id: listing.id,
    title: listing.title,
    city: listing.city,
    checkin_time: listing.checkin_time ?? null,
    checkout_time: listing.checkout_time ?? null,
    address: null,
    check_in_instructions: null,
    check_in_contact: null,
    media: [] as unknown[],
  };
}
