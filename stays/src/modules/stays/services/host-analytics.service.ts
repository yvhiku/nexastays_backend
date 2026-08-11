import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { StaysBooking } from '../entities/stays-booking.entity';
import { StaysListing } from '../entities/stays-listing.entity';
import { StaysLedgerEntry } from '../entities/stays-ledger-entry.entity';
import { StaysExternalCalendar } from '../entities/stays-external-calendar.entity';
import { BookingLifecycleService } from './booking-lifecycle.service';
import { HostListingsService } from './host-listings.service';
import {
  HOST_ANALYTICS_OCCUPANCY_BASIS,
  HOST_ANALYTICS_PERIODS,
  type HostAnalyticsPeriodId,
  type HostAnalyticsPropertyDto,
  type HostAnalyticsResponseDto,
} from '../dto/host-analytics.dto';
import {
  bookedNightsInHalfOpenRange,
  getDashboardNow,
  stayNights,
  toCasablancaYmd,
  toDateOnlyYmd,
  ymdCompare,
  ymdInHalfOpen,
  type DashboardNow,
} from './host-dashboard-timezone';

const EARNING_STATUSES: StaysBooking['status'][] = [
  'CONFIRMED',
  'CHECKED_IN',
  'COMPLETED',
];

const PENDING_STATUSES: StaysBooking['status'][] = [
  'INITIATED',
  'PAYMENT_PENDING',
];

const FUTURE_EARNING_STATUSES: StaysBooking['status'][] = [
  'CONFIRMED',
  'CHECKED_IN',
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function hostPayout(b: StaysBooking): number {
  if (b.payout_amount != null) return Number(b.payout_amount);
  return Math.max(0, Number(b.total_subtotal) - Number(b.host_fee));
}

function grossPaid(b: StaysBooking): number {
  return Number(b.total_paid ?? 0);
}

function platformFees(b: StaysBooking): number {
  return Number(b.guest_fee ?? 0) + Number(b.host_fee ?? 0);
}

type ResolvedPeriod = {
  id: HostAnalyticsPeriodId;
  start: string;
  end_exclusive: string;
  /** Finite Casablanca period days for occupancy; null for all_time. */
  period_days: number | null;
  /**
   * Earnings attribution:
   * - attr: confirmed_at ?? created_at in period (H3 money)
   * - checkin_window: CONFIRMED|CHECKED_IN check-in in [start,end)
   * - all: all earning bookings
   */
  earnings_mode: 'attr' | 'checkin_window' | 'all';
};

function parsePeriodId(raw?: string): HostAnalyticsPeriodId {
  const id = (raw?.trim() || 'this_month') as HostAnalyticsPeriodId;
  if (!(HOST_ANALYTICS_PERIODS as readonly string[]).includes(id)) {
    throw new BadRequestException(
      `Invalid period. Supported: ${HOST_ANALYTICS_PERIODS.join(', ')}`,
    );
  }
  return id;
}

function resolvePeriod(
  id: HostAnalyticsPeriodId,
  dash: DashboardNow,
): ResolvedPeriod {
  switch (id) {
    case 'this_month':
      return {
        id,
        start: dash.thisMonthStart,
        end_exclusive: dash.thisMonthEndExclusive,
        period_days: dash.daysInThisMonth,
        earnings_mode: 'attr',
      };
    case 'previous_month':
      return {
        id,
        start: dash.previousMonthStart,
        end_exclusive: dash.previousMonthEndExclusive,
        period_days: dash.daysInPreviousMonth,
        earnings_mode: 'attr',
      };
    case 'next_30d':
      return {
        id,
        start: dash.today,
        end_exclusive: dash.in30EndExclusive,
        period_days: 30,
        earnings_mode: 'checkin_window',
      };
    case 'all_time':
      return {
        id,
        start: '1970-01-01',
        end_exclusive: '9999-01-01',
        period_days: null,
        earnings_mode: 'all',
      };
    default: {
      const _exhaustive: never = id;
      throw new BadRequestException(`Unsupported period: ${_exhaustive}`);
    }
  }
}

type Acc = {
  listing: Pick<
    StaysListing,
    'id' | 'title' | 'city' | 'status' | 'avg_rating' | 'review_count'
  >;
  bookings: {
    total: number;
    payment_pending: number;
    upcoming: number;
    current: number;
    completed: number;
    cancelled: number;
  };
  booked_in_period: number;
  gross: number;
  net: number;
  fees: number;
  upcoming_30d: number;
  checkins_today: number;
  checkouts_today: number;
  next_checkin_date: string | null;
  upcoming_bookings: number;
  currently_staying: number;
  payout_pending: number;
  payout_paid_out: number;
};

/**
 * H10 host property performance analytics (H7 locked contract).
 *
 * Host scope = JWT userId → listings.host_user_id only (never client hostId).
 * Money rules match H3. Occupancy basis is BOOKED_NIGHTS_OVER_PERIOD_DAYS_V1
 * (not host BOOKED_OVER_CAPACITY_V1). Blocks/ICAL busy are ignored.
 *
 * Limitation: in-memory aggregation over host listings/bookings (same H3 pattern).
 */
@Injectable()
export class HostAnalyticsService {
  constructor(
    @InjectRepository(StaysBooking)
    private readonly bookingRepo: Repository<StaysBooking>,
    @InjectRepository(StaysListing)
    private readonly listingRepo: Repository<StaysListing>,
    @InjectRepository(StaysLedgerEntry)
    private readonly ledgerRepo: Repository<StaysLedgerEntry>,
    @InjectRepository(StaysExternalCalendar)
    private readonly calendarRepo: Repository<StaysExternalCalendar>,
    private readonly lifecycleService: BookingLifecycleService,
    private readonly hostListingsService: HostListingsService,
  ) {}

  async getHostAnalytics(
    hostUserId: string,
    periodRaw?: string,
    at?: Date,
  ): Promise<HostAnalyticsResponseDto> {
    const periodId = parsePeriodId(periodRaw);
    const dash = getDashboardNow(at ?? new Date());
    const period = resolvePeriod(periodId, dash);

    const listings = await this.listingRepo.find({
      where: { host_user_id: hostUserId },
      select: [
        'id',
        'title',
        'city',
        'status',
        'avg_rating',
        'review_count',
      ],
      order: { created_at: 'DESC' },
    });
    const listingIds = listings.map((l) => l.id);

    const empty: HostAnalyticsResponseDto = {
      as_of: dash.asOfIso,
      timezone: dash.timezone,
      currency: 'MAD',
      period: {
        id: period.id,
        start: period.start,
        end_exclusive: period.end_exclusive,
      },
      eligible_booking_statuses: [...EARNING_STATUSES],
      properties: [],
    };

    if (listingIds.length === 0) {
      return empty;
    }

    const [bookings, calendars, summaries, payoutByListing] = await Promise.all([
      this.bookingRepo.find({
        where: { listing_id: In(listingIds) },
      }),
      this.calendarRepo.find({
        where: { listing_id: In(listingIds) },
        select: ['listing_id', 'status'],
      }),
      this.hostListingsService.getHostListings(hostUserId),
      this.sumPayoutsByListing(hostUserId),
    ]);

    const accById = new Map<string, Acc>();
    for (const listing of listings) {
      const payout = payoutByListing.get(listing.id) ?? {
        pending: 0,
        paid_out: 0,
      };
      accById.set(listing.id, {
        listing,
        bookings: {
          total: 0,
          payment_pending: 0,
          upcoming: 0,
          current: 0,
          completed: 0,
          cancelled: 0,
        },
        booked_in_period: 0,
        gross: 0,
        net: 0,
        fees: 0,
        upcoming_30d: 0,
        checkins_today: 0,
        checkouts_today: 0,
        next_checkin_date: null,
        upcoming_bookings: 0,
        currently_staying: 0,
        payout_pending: payout.pending,
        payout_paid_out: payout.paid_out,
      });
    }

    for (const b of bookings) {
      const acc = accById.get(b.listing_id);
      if (!acc) continue; // host isolation — foreign listing ids never present

      const checkin = toDateOnlyYmd(b.checkin_date);
      const checkout = toDateOnlyYmd(b.checkout_date);

      acc.bookings.total += 1;
      if (PENDING_STATUSES.includes(b.status)) {
        acc.bookings.payment_pending += 1;
      }
      if (b.status === 'COMPLETED') {
        acc.bookings.completed += 1;
      }
      if (
        b.status === 'CANCELLED_BY_GUEST' ||
        b.status === 'CANCELLED_BY_HOST' ||
        b.status === 'EXPIRED'
      ) {
        acc.bookings.cancelled += 1;
      }

      const life = this.lifecycleService.computeLifecycle(b, {
        now: dash.nowJs,
      });
      if (life === 'UPCOMING') {
        acc.bookings.upcoming += 1;
        acc.upcoming_bookings += 1;
        if (
          !acc.next_checkin_date ||
          ymdCompare(checkin, acc.next_checkin_date) < 0
        ) {
          acc.next_checkin_date = checkin;
        }
      }

      const stayStatuses =
        b.status === 'CONFIRMED' || b.status === 'CHECKED_IN';
      const checkoutStatuses = stayStatuses || b.status === 'COMPLETED';

      if (
        stayStatuses &&
        ymdCompare(checkin, dash.today) <= 0 &&
        ymdCompare(checkout, dash.today) > 0
      ) {
        acc.bookings.current += 1;
        acc.currently_staying += 1;
      }

      if (stayStatuses && checkin === dash.today) {
        acc.checkins_today += 1;
      }
      if (checkoutStatuses && checkout === dash.today) {
        acc.checkouts_today += 1;
      }

      // Upcoming 30d net (always H3 check-in window, independent of selected period)
      if (
        FUTURE_EARNING_STATUSES.includes(b.status) &&
        ymdInHalfOpen(checkin, dash.today, dash.in30EndExclusive)
      ) {
        acc.upcoming_30d += hostPayout(b);
      }

      if (!EARNING_STATUSES.includes(b.status)) continue;

      const inEarnings = this.bookingInPeriodEarnings(b, period, checkin);
      if (inEarnings) {
        acc.gross += grossPaid(b);
        acc.net += hostPayout(b);
        acc.fees += platformFees(b);
      }

      if (period.earnings_mode === 'all') {
        acc.booked_in_period += stayNights(checkin, checkout);
      } else {
        acc.booked_in_period += bookedNightsInHalfOpenRange(
          checkin,
          checkout,
          period.start,
          period.end_exclusive,
        );
      }
    }

    const summaryById = new Map(
      summaries.map((s) => [s.id as string, s] as const),
    );
    const calendarByListing = this.calendarStatusByListing(calendars);

    const currency =
      bookings.find((b) => b.currency)?.currency ??
      'MAD';

    const properties: HostAnalyticsPropertyDto[] = listings.map((listing) => {
      const acc = accById.get(listing.id)!;
      const summary = summaryById.get(listing.id);
      const cal = calendarByListing.get(listing.id) ?? 'NONE';
      const completionPct = summary?.completion_percentage ?? 0;
      const photosComplete = Boolean(summary?.completion_flags?.photos_complete);
      const missing = (summary?.missing ?? []).map(
        (m: { key?: string; code?: string; label: string }) => ({
          code: m.code ?? m.key ?? 'missing',
          label: m.label,
        }),
      );
      const attention: string[] = [];
      if (cal === 'ERROR') attention.push('CALENDAR_ERROR');
      if (listing.status === 'LIVE' && missing.length > 0) {
        attention.push('INCOMPLETE_LIVE');
      }
      if (listing.status === 'PAUSED') attention.push('PAUSED');
      if (listing.status === 'DRAFT') attention.push('DRAFT');
      if (listing.status === 'REJECTED') attention.push('REJECTED');
      if (acc.bookings.payment_pending > 0) {
        attention.push('PAYMENT_PENDING');
      }

      const occupancyValue =
        period.period_days != null && period.period_days > 0
          ? Math.min(
              100,
              Math.round(
                (acc.booked_in_period / period.period_days) * 1000,
              ) / 10,
            )
          : null;

      const avgRating =
        listing.avg_rating != null && Number.isFinite(Number(listing.avg_rating))
          ? Number(listing.avg_rating)
          : null;
      const reviewCount = listing.review_count ?? 0;

      return {
        listing_id: listing.id,
        title: listing.title ?? '',
        city: listing.city ?? '',
        status: listing.status,
        bookings: { ...acc.bookings },
        nights: { booked_in_period: acc.booked_in_period },
        earnings: {
          gross_revenue: round2(acc.gross),
          net_host_earnings: round2(acc.net),
          platform_fees: round2(acc.fees),
          upcoming_revenue_30d: round2(acc.upcoming_30d),
        },
        occupancy: {
          value: occupancyValue,
          basis: HOST_ANALYTICS_OCCUPANCY_BASIS,
        },
        reviews: {
          avg_rating: avgRating,
          total_reviews: reviewCount,
        },
        operations: {
          checkins_today: acc.checkins_today,
          checkouts_today: acc.checkouts_today,
          next_checkin_date: acc.next_checkin_date,
          upcoming_bookings: acc.upcoming_bookings,
          currently_staying: acc.currently_staying,
        },
        payouts: {
          pending: round2(acc.payout_pending),
          paid_out: round2(acc.payout_paid_out),
        },
        health: {
          completion_percentage: completionPct,
          photos_complete: photosComplete,
          calendar_status: cal,
          missing,
          attention,
        },
      };
    });

    return {
      as_of: dash.asOfIso,
      timezone: dash.timezone,
      currency,
      period: {
        id: period.id,
        start: period.start,
        end_exclusive: period.end_exclusive,
      },
      eligible_booking_statuses: [...EARNING_STATUSES],
      properties,
    };
  }

  private bookingInPeriodEarnings(
    b: StaysBooking,
    period: ResolvedPeriod,
    checkinYmd: string,
  ): boolean {
    if (period.earnings_mode === 'all') {
      return EARNING_STATUSES.includes(b.status);
    }
    if (period.earnings_mode === 'checkin_window') {
      return (
        FUTURE_EARNING_STATUSES.includes(b.status) &&
        ymdInHalfOpen(checkinYmd, period.start, period.end_exclusive)
      );
    }
    // attr
    if (!EARNING_STATUSES.includes(b.status)) return false;
    const attrYmd = toCasablancaYmd(b.confirmed_at ?? b.created_at);
    return ymdInHalfOpen(attrYmd, period.start, period.end_exclusive);
  }

  private calendarStatusByListing(
    calendars: Array<{ listing_id: string; status: string }>,
  ): Map<string, string> {
    const byListing = new Map<string, Set<string>>();
    for (const c of calendars) {
      const set = byListing.get(c.listing_id) ?? new Set<string>();
      set.add(c.status);
      byListing.set(c.listing_id, set);
    }
    const out = new Map<string, string>();
    for (const [listingId, statuses] of byListing) {
      if (statuses.has('ERROR')) out.set(listingId, 'ERROR');
      else if (statuses.size > 1) out.set(listingId, 'MIXED');
      else out.set(listingId, [...statuses][0] ?? 'NONE');
    }
    return out;
  }

  private async sumPayoutsByListing(
    hostUserId: string,
  ): Promise<Map<string, { pending: number; paid_out: number }>> {
    const rows = await this.ledgerRepo
      .createQueryBuilder('e')
      .innerJoinAndSelect('e.booking', 'b')
      .innerJoin('b.listing', 'l')
      .where('l.host_user_id = :hostUserId', { hostUserId })
      .andWhere('e.type = :type', { type: 'HOST_PAYOUT' })
      .andWhere('e.status IN (:...statuses)', {
        statuses: ['PENDING', 'SETTLED'],
      })
      .getMany();

    const map = new Map<string, { pending: number; paid_out: number }>();
    for (const row of rows) {
      const listingId = (row.booking as StaysBooking | undefined)?.listing_id;
      if (!listingId) continue;
      const cur = map.get(listingId) ?? { pending: 0, paid_out: 0 };
      const amt = Number(row.amount);
      if (row.status === 'PENDING') cur.pending += amt;
      if (row.status === 'SETTLED') cur.paid_out += amt;
      map.set(listingId, cur);
    }
    return map;
  }
}
