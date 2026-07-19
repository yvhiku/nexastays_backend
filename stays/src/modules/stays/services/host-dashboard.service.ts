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
