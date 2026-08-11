import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { StaysBooking } from '../entities/stays-booking.entity';
import { StaysListing } from '../entities/stays-listing.entity';
import { StaysLedgerEntry } from '../entities/stays-ledger-entry.entity';
import { StaysExternalCalendar } from '../entities/stays-external-calendar.entity';
import { StaysReviewsService } from './stays-reviews.service';
import { BookingLifecycleService } from './booking-lifecycle.service';
import { HostListingsService } from './host-listings.service';
import {
  getStaysPaymentProvider,
  isMockPaymentProvider,
} from '../payments/payment-provider.config';
import { resolveNexaStage } from '../../../common/security/cors-origins';
import {
  bookedNightsInCalendarMonth,
  getDashboardNow,
  toCasablancaYmd,
  toDateOnlyYmd,
  ymdCompare,
  ymdInHalfOpen,
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

const ACTIVE_STATUSES: StaysBooking['status'][] = [
  'CONFIRMED',
  'CHECKED_IN',
];

const FUTURE_EARNING_STATUSES: StaysBooking['status'][] = [
  'CONFIRMED',
  'CHECKED_IN',
];

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDateOnly(value: Date | string): Date {
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (m) {
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
  }
  const d = new Date(value);
  return startOfLocalDay(d);
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Nights of [checkin, checkout) that fall inside calendar month (local). */
function bookedNightsInMonth(
  checkin: Date,
  checkout: Date,
  year: number,
  monthIndex: number,
): number {
  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 1);
  const start = Math.max(checkin.getTime(), monthStart.getTime());
  const end = Math.min(checkout.getTime(), monthEnd.getTime());
  if (end <= start) return 0;
  return Math.round((end - start) / 86_400_000);
}

function momPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class HostDashboardService {
  constructor(
    @InjectRepository(StaysBooking)
    private readonly bookingRepo: Repository<StaysBooking>,
    @InjectRepository(StaysListing)
    private readonly listingRepo: Repository<StaysListing>,
    @InjectRepository(StaysLedgerEntry)
    private readonly ledgerRepo: Repository<StaysLedgerEntry>,
    @InjectRepository(StaysExternalCalendar)
    private readonly calendarRepo: Repository<StaysExternalCalendar>,
    private readonly staysReviewsService: StaysReviewsService,
    private readonly lifecycleService: BookingLifecycleService,
    private readonly hostListingsService: HostListingsService,
  ) {}

  /**
   * H3 aggregated host dashboard — Casablanca TZ, gross/net/fees split,
   * mock payout contract. Host scope = JWT sub only (no client hostId).
   *
   * Limitation: in-memory aggregation over host bookings (same as getHostStats).
   * SQL rollups deferred if volume requires it later.
   */
  async getHostDashboard(hostUserId: string, at?: Date) {
    const dash = getDashboardNow(at ?? new Date());
    const listings = await this.listingRepo.find({
      where: { host_user_id: hostUserId },
      select: ['id', 'status'],
    });
    const listingIds = listings.map((l) => l.id);
    const liveListings = listings.filter((l) => l.status === 'LIVE').length;

    let bookings: StaysBooking[] = [];
    if (listingIds.length > 0) {
      bookings = await this.bookingRepo.find({
        where: { listing_id: In(listingIds) },
        relations: ['occupants'],
      });
    }

    const hostPayout = (b: StaysBooking) => {
      if (b.payout_amount != null) return Number(b.payout_amount);
      return Math.max(0, Number(b.total_subtotal) - Number(b.host_fee));
    };
    const grossPaid = (b: StaysBooking) => Number(b.total_paid ?? 0);
    const platformFees = (b: StaysBooking) =>
      Number(b.guest_fee ?? 0) + Number(b.host_fee ?? 0);

    let grossAll = 0;
    let netAll = 0;
    let feesAll = 0;
    let grossThis = 0;
    let netThis = 0;
    let feesThis = 0;
    let grossPrev = 0;
    let netPrev = 0;
    let feesPrev = 0;
    let upcomingRevenue30d = 0;
    let bookedNightsThisMonth = 0;
    let bookedNightsPrevMonth = 0;

    for (const b of bookings) {
      if (!EARNING_STATUSES.includes(b.status)) continue;
      const payout = hostPayout(b);
      const gross = grossPaid(b);
      const fees = platformFees(b);
      grossAll += gross;
      netAll += payout;
      feesAll += fees;

      // Month attribution: confirmed_at ?? created_at in Africa/Casablanca
      const attrYmd = toCasablancaYmd(b.confirmed_at ?? b.created_at);
      if (ymdInHalfOpen(attrYmd, dash.thisMonthStart, dash.thisMonthEndExclusive)) {
        grossThis += gross;
        netThis += payout;
        feesThis += fees;
      }
      if (
        ymdInHalfOpen(
          attrYmd,
          dash.previousMonthStart,
          dash.previousMonthEndExclusive,
        )
      ) {
        grossPrev += gross;
        netPrev += payout;
        feesPrev += fees;
      }

      const checkin = toDateOnlyYmd(b.checkin_date);
      const checkout = toDateOnlyYmd(b.checkout_date);
      bookedNightsThisMonth += bookedNightsInCalendarMonth(
        checkin,
        checkout,
        dash.year,
        dash.month,
      );
      bookedNightsPrevMonth += bookedNightsInCalendarMonth(
        checkin,
        checkout,
        dash.previousYear,
        dash.previousMonth,
      );
    }

    // upcoming_revenue_30d = net payout of FUTURE earning bookings with
    // check-in in [today, today+30) Casablanca days (CONFIRMED | CHECKED_IN).
    for (const b of bookings) {
      if (!FUTURE_EARNING_STATUSES.includes(b.status)) continue;
      const checkin = toDateOnlyYmd(b.checkin_date);
      if (ymdInHalfOpen(checkin, dash.today, dash.in30EndExclusive)) {
        upcomingRevenue30d += hostPayout(b);
      }
    }

    /**
     * Occupancy (v1): booked nights in month /
     * (days_in_month × max(live_listings, 1)).
     * Ignores availability blocks — BOOKED_OVER_CAPACITY_V1.
     */
    const capacity = dash.daysInThisMonth * Math.max(liveListings, 1);
    const occupancyPctThisMonth =
      capacity > 0
        ? Math.min(100, Math.round((bookedNightsThisMonth / capacity) * 1000) / 10)
        : 0;

    let checkinsToday = 0;
    let checkoutsToday = 0;
    let checkoutsTomorrow = 0;
    let currentlyStaying = 0;
    let newBookingsToday = 0;
    let awaitingGuestPayment = 0;
    let upcomingCheckins = 0;
    let nextUpcoming: StaysBooking | null = null;

    for (const b of bookings) {
      const checkin = toDateOnlyYmd(b.checkin_date);
      const checkout = toDateOnlyYmd(b.checkout_date);
      const createdYmd = toCasablancaYmd(b.created_at);

      if (createdYmd === dash.today) {
        newBookingsToday += 1;
      }

      const life = this.lifecycleService.computeLifecycle(b, {
        now: dash.nowJs,
      });
      if (life === 'PENDING_PAYMENT') {
        awaitingGuestPayment += 1;
      }
      if (life === 'UPCOMING') {
        upcomingCheckins += 1;
        if (
          !nextUpcoming ||
          ymdCompare(checkin, toDateOnlyYmd(nextUpcoming.checkin_date)) < 0
        ) {
          nextUpcoming = b;
        }
      }

      const stayStatuses =
        b.status === 'CONFIRMED' || b.status === 'CHECKED_IN';
      const checkoutStatuses =
        stayStatuses || b.status === 'COMPLETED';

      if (stayStatuses && checkin === dash.today) {
        checkinsToday += 1;
      }
      if (checkoutStatuses && checkout === dash.today) {
        checkoutsToday += 1;
      }
      if (checkoutStatuses && checkout === dash.tomorrow) {
        checkoutsTomorrow += 1;
      }
      // Currently staying: calendar overlap with Casablanca today
      if (
        stayStatuses &&
        ymdCompare(checkin, dash.today) <= 0 &&
        ymdCompare(checkout, dash.today) > 0
      ) {
        currentlyStaying += 1;
      }
    }

    const { pending, paidOut } = await this.sumHostPayoutLedger(
      hostUserId,
      listingIds,
    );

    let calendarStatus = {
      healthy: true,
      listings_needing_attention: 0,
    };
    if (listingIds.length > 0) {
      const calendars = await this.calendarRepo.find({
        where: { listing_id: In(listingIds) },
        select: ['id', 'listing_id', 'status'],
      });
      const badListings = new Set(
        calendars
          .filter((c) => c.status === 'ERROR')
          .map((c) => c.listing_id),
      );
      calendarStatus = {
        healthy: badListings.size === 0,
        listings_needing_attention: badListings.size,
      };
    }

    const listingHealth = await this.buildListingHealth(
      hostUserId,
      listingIds,
      liveListings,
    );

    const reviewsPayload = await this.staysReviewsService.listHostReviews(
      hostUserId,
      1,
      1,
    );

    const currency = bookings.find((b) => b.currency)?.currency ?? 'MAD';
    const payoutMeta = this.buildPayoutMeta();

    return {
      as_of: dash.asOfIso,
      timezone: dash.timezone,
      currency,
      today: {
        checkins_today: checkinsToday,
        checkouts_today: checkoutsToday,
        checkouts_tomorrow: checkoutsTomorrow,
        currently_staying: currentlyStaying,
        new_bookings_today: newBookingsToday,
        awaiting_guest_payment: awaitingGuestPayment,
      },
      earnings: {
        gross_revenue_all_time: round2(grossAll),
        net_host_earnings_all_time: round2(netAll),
        platform_fees_all_time: round2(feesAll),
        this_month: {
          gross_revenue: round2(grossThis),
          net_host_earnings: round2(netThis),
          platform_fees: round2(feesThis),
          mom_pct: momPct(netThis, netPrev),
        },
        previous_month: {
          gross_revenue: round2(grossPrev),
          net_host_earnings: round2(netPrev),
          platform_fees: round2(feesPrev),
        },
        upcoming_revenue_30d: round2(upcomingRevenue30d),
      },
      payouts: {
        provider: payoutMeta.provider,
        mode: payoutMeta.mode,
        pending,
        available: 0,
        paid_out: paidOut,
        currency,
        disclaimer: payoutMeta.disclaimer,
      },
      operations: {
        upcoming_checkins: upcomingCheckins,
        next_checkin_date: nextUpcoming
          ? toDateOnlyYmd(nextUpcoming.checkin_date)
          : null,
        next_guest_name: nextUpcoming
          ? this.resolveGuestDisplayName(nextUpcoming)
          : null,
      },
      inventory: {
        live_listings: liveListings,
        pending_listings: listings.filter(
          (l) => l.status === 'SUBMITTED' || l.status === 'DRAFT',
        ).length,
        total_listings: listings.length,
        occupancy_pct_this_month: occupancyPctThisMonth,
        occupancy_basis: 'BOOKED_OVER_CAPACITY_V1' as const,
      },
      reviews: {
        avg_rating: reviewsPayload.summary.overall_avg_rating,
        total_reviews: reviewsPayload.summary.total_count,
      },
      messaging: {
        unread_count: null as null,
        status: 'unavailable' as const,
      },
      calendar_status: calendarStatus,
      listing_health: listingHealth,
      bookings_summary: {
        total: bookings.length,
        pending: bookings.filter((b) => PENDING_STATUSES.includes(b.status))
          .length,
        active: bookings.filter((b) => ACTIVE_STATUSES.includes(b.status))
          .length,
        completed: bookings.filter((b) => b.status === 'COMPLETED').length,
        cancelled: bookings.filter(
          (b) =>
            b.status === 'CANCELLED_BY_GUEST' ||
            b.status === 'CANCELLED_BY_HOST' ||
            b.status === 'EXPIRED',
        ).length,
      },
    };
  }

  private buildPayoutMeta(): {
    provider: string;
    mode: string;
    disclaimer: string;
  } {
    const provider = getStaysPaymentProvider();
    const stage = resolveNexaStage();
    const mock = isMockPaymentProvider();
    const mode = mock
      ? stage === 'dogfood'
        ? 'dogfood'
        : stage === 'staging'
          ? 'staging_mock'
          : 'mock'
      : stage;
    const disclaimer = mock
      ? 'Test environment — payouts are simulated. No real money is transferred.'
      : 'Payout wallet settlement is not enabled. Pending amounts reflect ledger HOST_PAYOUT entries only.';
    return { provider, mode, disclaimer };
  }

  private async sumHostPayoutLedger(
    hostUserId: string,
    listingIds: string[],
  ): Promise<{ pending: number; paidOut: number }> {
    if (listingIds.length === 0) {
      return { pending: 0, paidOut: 0 };
    }
    const rows = await this.ledgerRepo
      .createQueryBuilder('e')
      .innerJoin('e.booking', 'b')
      .innerJoin('b.listing', 'l')
      .where('l.host_user_id = :hostUserId', { hostUserId })
      .andWhere('e.type = :type', { type: 'HOST_PAYOUT' })
      .andWhere('e.status IN (:...statuses)', {
        statuses: ['PENDING', 'SETTLED'],
      })
      .getMany();

    let pending = 0;
    let paidOut = 0;
    for (const row of rows) {
      const amt = Number(row.amount);
      if (row.status === 'PENDING') pending += amt;
      if (row.status === 'SETTLED') paidOut += amt;
    }
    return { pending: round2(pending), paidOut: round2(paidOut) };
  }

  async getHostStats(hostUserId: string) {
    const listings = await this.listingRepo.find({
      where: { host_user_id: hostUserId },
      select: ['id', 'status'],
    });
    const listingIds = listings.map((l) => l.id);
    const liveListings = listings.filter((l) => l.status === 'LIVE').length;

    let bookings: StaysBooking[] = [];
    if (listingIds.length > 0) {
      bookings = await this.bookingRepo.find({
        where: { listing_id: In(listingIds) },
        relations: ['occupants'],
      });
    }

    const hostPayout = (b: StaysBooking) => {
      if (b.payout_amount != null) return Number(b.payout_amount);
      return Math.max(0, Number(b.total_subtotal) - Number(b.host_fee));
    };

    const now = new Date();
    const today = startOfLocalDay(now);
    const tomorrow = addDays(today, 1);
    const in30 = addDays(today, 30);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = monthStart;

    let totalEarnings = 0;
    let thisMonthEarnings = 0;
    let previousMonthEarnings = 0;
    let upcomingRevenue30d = 0;
    let bookedNightsThisMonth = 0;
    let bookedNightsPrevMonth = 0;

    for (const b of bookings) {
      if (!EARNING_STATUSES.includes(b.status)) continue;
      const payout = hostPayout(b);
      totalEarnings += payout;
      const refDate = b.confirmed_at ?? b.created_at;
      const ref = new Date(refDate);
      if (ref >= monthStart) {
        thisMonthEarnings += payout;
      }
      if (ref >= prevMonthStart && ref < prevMonthEnd) {
        previousMonthEarnings += payout;
      }

      const checkin = parseDateOnly(b.checkin_date);
      const checkout = parseDateOnly(b.checkout_date);
      bookedNightsThisMonth += bookedNightsInMonth(
        checkin,
        checkout,
        now.getFullYear(),
        now.getMonth(),
      );
      bookedNightsPrevMonth += bookedNightsInMonth(
        checkin,
        checkout,
        prevMonthStart.getFullYear(),
        prevMonthStart.getMonth(),
      );
    }

    for (const b of bookings) {
      if (!FUTURE_EARNING_STATUSES.includes(b.status)) continue;
      const checkin = parseDateOnly(b.checkin_date);
      if (checkin >= today && checkin < in30) {
        upcomingRevenue30d += hostPayout(b);
      }
    }

    /**
     * Occupancy (v1): booked nights in month /
     * (days_in_month × max(live_listings, 1)).
     * Later: booked nights / available nights from calendars.
     */
    const dim = daysInMonth(now.getFullYear(), now.getMonth());
    const capacity = dim * Math.max(liveListings, 1);
    const occupancyPctThisMonth =
      capacity > 0
        ? Math.min(100, Math.round((bookedNightsThisMonth / capacity) * 1000) / 10)
        : 0;

    const prevDim = daysInMonth(
      prevMonthStart.getFullYear(),
      prevMonthStart.getMonth(),
    );
    const prevCapacity = prevDim * Math.max(liveListings, 1);
    const occupancyPrev =
      prevCapacity > 0
        ? Math.min(
            100,
            Math.round((bookedNightsPrevMonth / prevCapacity) * 1000) / 10,
          )
        : 0;

    const avgNightlyEarnings =
      bookedNightsThisMonth > 0
        ? round2(thisMonthEarnings / bookedNightsThisMonth)
        : null;

    let upcomingCheckins = 0;
    let currentGuests = 0;
    let checkinsToday = 0;
    let checkoutsTomorrow = 0;
    let awaitingGuestPayment = 0;
    let nextUpcoming: StaysBooking | null = null;

    for (const b of bookings) {
      const life = this.lifecycleService.computeLifecycle(b, { now });
      const checkin = parseDateOnly(b.checkin_date);
      const checkout = parseDateOnly(b.checkout_date);

      if (life === 'PENDING_PAYMENT') {
        awaitingGuestPayment += 1;
      }
      if (life === 'UPCOMING') {
        upcomingCheckins += 1;
        if (
          !nextUpcoming ||
          checkin < parseDateOnly(nextUpcoming.checkin_date)
        ) {
          nextUpcoming = b;
        }
      }
      if (life === 'ACTIVE') {
        currentGuests += 1;
      }
      if (
        (b.status === 'CONFIRMED' || b.status === 'CHECKED_IN') &&
        checkin.getTime() === today.getTime()
      ) {
        checkinsToday += 1;
      }
      if (
        (b.status === 'CONFIRMED' ||
          b.status === 'CHECKED_IN' ||
          b.status === 'COMPLETED') &&
        checkout.getTime() === tomorrow.getTime()
      ) {
        checkoutsTomorrow += 1;
      }
    }

    const nextGuestName = nextUpcoming
      ? this.resolveGuestDisplayName(nextUpcoming)
      : null;
    const nextCheckinDate = nextUpcoming
      ? toIsoDate(parseDateOnly(nextUpcoming.checkin_date))
      : null;

    const revenueSeries30d = this.buildRevenueSeries(bookings, hostPayout, today);

    let pendingPayoutAmount: number | null = null;
    if (listingIds.length > 0) {
      const pendingRows = await this.ledgerRepo
        .createQueryBuilder('e')
        .innerJoin('e.booking', 'b')
        .innerJoin('b.listing', 'l')
        .where('l.host_user_id = :hostUserId', { hostUserId })
        .andWhere('e.type = :type', { type: 'HOST_PAYOUT' })
        .andWhere('e.status = :status', { status: 'PENDING' })
        .getMany();
      if (pendingRows.length > 0) {
        pendingPayoutAmount = round2(
          pendingRows.reduce((sum, row) => sum + Number(row.amount), 0),
        );
      } else {
        pendingPayoutAmount = 0;
      }
    }

    let calendarStatus = {
      healthy: true,
      listings_needing_attention: 0,
    };
    if (listingIds.length > 0) {
      const calendars = await this.calendarRepo.find({
        where: { listing_id: In(listingIds) },
        select: ['id', 'listing_id', 'status'],
      });
      const badListings = new Set(
        calendars
          .filter((c) => c.status === 'ERROR')
          .map((c) => c.listing_id),
      );
      calendarStatus = {
        healthy: badListings.size === 0,
        listings_needing_attention: badListings.size,
      };
    }

    const listingHealth = await this.buildListingHealth(
      hostUserId,
      listingIds,
      liveListings,
    );

    const reviewsPayload = await this.staysReviewsService.listHostReviews(
      hostUserId,
      1,
      1,
    );

    const currency = bookings.find((b) => b.currency)?.currency ?? 'MAD';

    return {
      total_earnings: round2(totalEarnings),
      this_month_earnings: round2(thisMonthEarnings),
      previous_month_earnings: round2(previousMonthEarnings),
      earnings_mom_pct: momPct(thisMonthEarnings, previousMonthEarnings),
      upcoming_revenue_30d: round2(upcomingRevenue30d),
      occupancy_pct_this_month: occupancyPctThisMonth,
      occupancy_mom_pct: momPct(occupancyPctThisMonth, occupancyPrev),
      avg_nightly_earnings: avgNightlyEarnings,
      currency,
      total_bookings: bookings.length,
      pending_bookings: bookings.filter((b) =>
        PENDING_STATUSES.includes(b.status),
      ).length,
      active_bookings: bookings.filter((b) =>
        ACTIVE_STATUSES.includes(b.status),
      ).length,
      completed_bookings: bookings.filter((b) => b.status === 'COMPLETED')
        .length,
      cancelled_bookings: bookings.filter(
        (b) =>
          b.status === 'CANCELLED_BY_GUEST' ||
          b.status === 'CANCELLED_BY_HOST' ||
          b.status === 'EXPIRED',
      ).length,
      live_listings: liveListings,
      pending_listings: listings.filter(
        (l) => l.status === 'SUBMITTED' || l.status === 'DRAFT',
      ).length,
      total_listings: listings.length,
      avg_rating: reviewsPayload.summary.overall_avg_rating,
      total_reviews: reviewsPayload.summary.total_count,
      upcoming_checkins: upcomingCheckins,
      next_checkin_date: nextCheckinDate,
      next_guest_name: nextGuestName,
      current_guests: currentGuests,
      checkins_today: checkinsToday,
      checkouts_tomorrow: checkoutsTomorrow,
      awaiting_guest_payment: awaitingGuestPayment,
      pending_payout_amount: pendingPayoutAmount,
      calendar_status: calendarStatus,
      revenue_series_30d: revenueSeries30d,
      listing_health: listingHealth,
    };
  }

  private buildRevenueSeries(
    bookings: StaysBooking[],
    hostPayout: (b: StaysBooking) => number,
    today: Date,
  ): Array<{ date: string; amount: number }> {
    const amounts = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      amounts.set(toIsoDate(addDays(today, -i)), 0);
    }
    for (const b of bookings) {
      if (!EARNING_STATUSES.includes(b.status)) continue;
      const checkin = parseDateOnly(b.checkin_date);
      const key = toIsoDate(checkin);
      if (!amounts.has(key)) continue;
      amounts.set(key, (amounts.get(key) ?? 0) + hostPayout(b));
    }
    return Array.from(amounts.entries()).map(([date, amount]) => ({
      date,
      amount: round2(amount),
    }));
  }

  private async buildListingHealth(
    hostUserId: string,
    listingIds: string[],
    liveListings: number,
  ) {
    const empty = {
      verified_live: false,
      calendar_synced: false,
      photos_complete: false,
      avg_completion_pct: 0,
      missing: [] as Array<{ code: string; label: string; count?: number }>,
    };
    if (listingIds.length === 0) return empty;

    const summaries = await this.hostListingsService.getHostListings(hostUserId);
    const calendars = await this.calendarRepo.find({
      where: { listing_id: In(listingIds) },
      select: ['listing_id', 'status'],
    });
    const syncedListings = new Set(
      calendars
        .filter((c) => c.status === 'ACTIVE' || c.status === 'SYNCING')
        .map((c) => c.listing_id),
    );

    let photosCompleteCount = 0;
    let completionSum = 0;
    const missingCounts = new Map<string, { label: string; count: number }>();

    for (const s of summaries) {
      const pct = s.completion_percentage ?? 0;
      completionSum += pct;
      const flags = s.completion_flags;
      if (flags?.photos_complete) photosCompleteCount += 1;
      for (const m of s.missing ?? []) {
        if (!m.required) continue;
        const prev = missingCounts.get(m.key);
        if (prev) prev.count += 1;
        else missingCounts.set(m.key, { label: m.label, count: 1 });
      }
    }

    const missing = Array.from(missingCounts.entries()).map(
      ([code, { label, count }]) => ({
        code,
        label: count > 1 ? `${label} (${count} listings)` : label,
        count,
      }),
    );

    return {
      verified_live: liveListings > 0,
      calendar_synced: syncedListings.size > 0,
      photos_complete:
        summaries.length > 0 && photosCompleteCount === summaries.length,
      avg_completion_pct:
        summaries.length > 0
          ? Math.round(completionSum / summaries.length)
          : 0,
      missing,
    };
  }

  private resolveGuestDisplayName(booking: StaysBooking): string | null {
    const occupants = booking.occupants ?? [];
    if (occupants.length === 0) return null;
    const primary =
      occupants.find((o) => o.is_primary) ??
      occupants.find((o) => o.full_name?.trim()) ??
      occupants[0];
    return primary?.full_name?.trim() || null;
  }
}
