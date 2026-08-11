import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { readFileSync } from 'fs';
import { join } from 'path';
import { HostAnalyticsService } from './host-analytics.service';
import { StaysBooking } from '../entities/stays-booking.entity';
import { StaysListing } from '../entities/stays-listing.entity';
import { StaysLedgerEntry } from '../entities/stays-ledger-entry.entity';
import { StaysExternalCalendar } from '../entities/stays-external-calendar.entity';
import { BookingLifecycleService } from './booking-lifecycle.service';
import { HostListingsService } from './host-listings.service';
import {
  DASHBOARD_TIMEZONE,
  bookedNightsInHalfOpenRange,
} from './host-dashboard-timezone';
import { HOST_ANALYTICS_OCCUPANCY_BASIS } from '../dto/host-analytics.dto';

describe('HostAnalyticsService.getHostAnalytics', () => {
  let service: HostAnalyticsService;
  let listingRepo: { find: jest.Mock };
  let bookingRepo: { find: jest.Mock };
  let ledgerRepo: { createQueryBuilder: jest.Mock };
  let calendarRepo: { find: jest.Mock };
  let hostListingsService: { getHostListings: jest.Mock };

  const hostA = 'host-a';
  const hostB = 'host-b';
  const listingA1 = 'listing-a1';
  const listingA2 = 'listing-a2';
  const listingB1 = 'listing-b1';

  /** Fixed Casablanca noon on 2026-08-11. */
  const frozenAt = DateTime.fromISO('2026-08-11T12:00:00', {
    zone: DASHBOARD_TIMEZONE,
  }).toJSDate();

  function listing(
    partial: Partial<StaysListing> & Pick<StaysListing, 'id' | 'host_user_id'>,
  ): StaysListing {
    return {
      title: 'Stay',
      city: 'Casablanca',
      status: 'LIVE',
      avg_rating: null,
      review_count: 0,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      ...partial,
    } as StaysListing;
  }

  function booking(partial: Record<string, unknown>): StaysBooking {
    return {
      currency: 'MAD',
      guest_fee: 50,
      host_fee: 30,
      total_subtotal: 500,
      total_paid: 580,
      payout_amount: 470,
      ...partial,
    } as StaysBooking;
  }

  beforeEach(async () => {
    listingRepo = { find: jest.fn() };
    bookingRepo = { find: jest.fn() };
    calendarRepo = { find: jest.fn().mockResolvedValue([]) };
    hostListingsService = {
      getHostListings: jest.fn().mockResolvedValue([]),
    };

    const qb = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    ledgerRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HostAnalyticsService,
        { provide: getRepositoryToken(StaysBooking), useValue: bookingRepo },
        { provide: getRepositoryToken(StaysListing), useValue: listingRepo },
        {
          provide: getRepositoryToken(StaysLedgerEntry),
          useValue: ledgerRepo,
        },
        {
          provide: getRepositoryToken(StaysExternalCalendar),
          useValue: calendarRepo,
        },
        BookingLifecycleService,
        { provide: HostListingsService, useValue: hostListingsService },
      ],
    }).compile();

    service = module.get(HostAnalyticsService);
  });

  it('returns empty properties for host with no listings', async () => {
    listingRepo.find.mockResolvedValue([]);
    const result = await service.getHostAnalytics(hostA, 'this_month', frozenAt);
    expect(result.timezone).toBe(DASHBOARD_TIMEZONE);
    expect(result.period.id).toBe('this_month');
    expect(result.period.start).toBe('2026-08-01');
    expect(result.period.end_exclusive).toBe('2026-09-01');
    expect(result.properties).toEqual([]);
    expect(result.eligible_booking_statuses).toEqual([
      'CONFIRMED',
      'CHECKED_IN',
      'COMPLETED',
    ]);
    expect(bookingRepo.find).not.toHaveBeenCalled();
  });

  it('includes zero-booking listing with denorm reviews and occupancy 0', async () => {
    listingRepo.find.mockResolvedValue([
      listing({
        id: listingA1,
        host_user_id: hostA,
        title: 'Riad',
        avg_rating: null,
        review_count: 0,
      }),
    ]);
    bookingRepo.find.mockResolvedValue([]);
    hostListingsService.getHostListings.mockResolvedValue([
      {
        id: listingA1,
        completion_percentage: 80,
        completion_flags: { photos_complete: true },
        missing: [],
      },
    ]);

    const result = await service.getHostAnalytics(hostA, 'this_month', frozenAt);
    expect(result.properties).toHaveLength(1);
    const p = result.properties[0];
    expect(p.listing_id).toBe(listingA1);
    expect(p.bookings.total).toBe(0);
    expect(p.earnings.gross_revenue).toBe(0);
    expect(p.nights.booked_in_period).toBe(0);
    expect(p.occupancy.value).toBe(0);
    expect(p.occupancy.basis).toBe(HOST_ANALYTICS_OCCUPANCY_BASIS);
    expect(p.reviews.avg_rating).toBeNull();
    expect(p.reviews.total_reviews).toBe(0);
  });

  it('aggregates one earning booking (CONFIRMED) with H3 money formulas', async () => {
    listingRepo.find.mockResolvedValue([
      listing({ id: listingA1, host_user_id: hostA, title: 'A1' }),
    ]);
    bookingRepo.find.mockResolvedValue([
      booking({
        id: 'b1',
        listing_id: listingA1,
        status: 'CONFIRMED',
        checkin_date: '2026-08-10',
        checkout_date: '2026-08-14',
        confirmed_at: new Date('2026-08-02T10:00:00.000Z'),
        created_at: new Date('2026-07-01T10:00:00.000Z'),
        total_paid: 1000,
        guest_fee: 100,
        host_fee: 50,
        payout_amount: 850,
      }),
    ]);

    const result = await service.getHostAnalytics(hostA, 'this_month', frozenAt);
    const p = result.properties[0];
    expect(p.earnings.gross_revenue).toBe(1000);
    expect(p.earnings.net_host_earnings).toBe(850);
    expect(p.earnings.platform_fees).toBe(150);
    expect(p.nights.booked_in_period).toBe(4);
    // 4 / 31 * 100 ≈ 12.9
    expect(p.occupancy.value).toBe(12.9);
    expect(p.occupancy.basis).toBe('BOOKED_NIGHTS_OVER_PERIOD_DAYS_V1');
  });

  it('includes CHECKED_IN and COMPLETED; excludes PAYMENT_PENDING and CANCELLED', async () => {
    listingRepo.find.mockResolvedValue([
      listing({ id: listingA1, host_user_id: hostA }),
    ]);
    bookingRepo.find.mockResolvedValue([
      booking({
        id: 'cin',
        listing_id: listingA1,
        status: 'CHECKED_IN',
        checkin_date: '2026-08-01',
        checkout_date: '2026-08-03',
        confirmed_at: new Date('2026-08-01T10:00:00.000Z'),
        created_at: new Date('2026-08-01T09:00:00.000Z'),
        total_paid: 200,
        guest_fee: 20,
        host_fee: 10,
        payout_amount: 170,
      }),
      booking({
        id: 'done',
        listing_id: listingA1,
        status: 'COMPLETED',
        checkin_date: '2026-08-05',
        checkout_date: '2026-08-07',
        confirmed_at: new Date('2026-08-04T10:00:00.000Z'),
        created_at: new Date('2026-08-03T10:00:00.000Z'),
        total_paid: 300,
        guest_fee: 30,
        host_fee: 15,
        payout_amount: 255,
      }),
      booking({
        id: 'pending',
        listing_id: listingA1,
        status: 'PAYMENT_PENDING',
        checkin_date: '2026-08-20',
        checkout_date: '2026-08-22',
        created_at: new Date('2026-08-11T10:00:00.000Z'),
        total_paid: 999,
        payout_amount: 900,
      }),
      booking({
        id: 'cancel',
        listing_id: listingA1,
        status: 'CANCELLED_BY_GUEST',
        checkin_date: '2026-08-15',
        checkout_date: '2026-08-18',
        created_at: new Date('2026-08-01T10:00:00.000Z'),
        confirmed_at: new Date('2026-08-01T12:00:00.000Z'),
        total_paid: 500,
        payout_amount: 400,
      }),
    ]);

    const result = await service.getHostAnalytics(hostA, 'this_month', frozenAt);
    const p = result.properties[0];
    expect(p.earnings.gross_revenue).toBe(500);
    expect(p.earnings.net_host_earnings).toBe(425);
    expect(p.earnings.platform_fees).toBe(75);
    expect(p.bookings.payment_pending).toBe(1);
    expect(p.bookings.cancelled).toBe(1);
    expect(p.bookings.completed).toBe(1);
  });

  it('uses payout_amount fallback max(0, subtotal - host_fee)', async () => {
    listingRepo.find.mockResolvedValue([
      listing({ id: listingA1, host_user_id: hostA }),
    ]);
    bookingRepo.find.mockResolvedValue([
      booking({
        id: 'b1',
        listing_id: listingA1,
        status: 'COMPLETED',
        checkin_date: '2026-08-01',
        checkout_date: '2026-08-02',
        confirmed_at: new Date('2026-08-01T10:00:00.000Z'),
        created_at: new Date('2026-08-01T09:00:00.000Z'),
        total_paid: 580,
        total_subtotal: 500,
        guest_fee: 50,
        host_fee: 30,
        payout_amount: null,
      }),
    ]);

    const result = await service.getHostAnalytics(hostA, 'this_month', frozenAt);
    expect(result.properties[0].earnings.net_host_earnings).toBe(470);
  });

  it('attributes earnings by confirmed_at Casablanca month; falls back to created_at', async () => {
    listingRepo.find.mockResolvedValue([
      listing({ id: listingA1, host_user_id: hostA }),
    ]);
    bookingRepo.find.mockResolvedValue([
      booking({
        id: 'prev',
        listing_id: listingA1,
        status: 'COMPLETED',
        checkin_date: '2026-08-10',
        checkout_date: '2026-08-12',
        // July attribution via confirmed_at
        confirmed_at: new Date('2026-07-20T10:00:00.000Z'),
        created_at: new Date('2026-08-01T10:00:00.000Z'),
        total_paid: 100,
        guest_fee: 10,
        host_fee: 5,
        payout_amount: 85,
      }),
      booking({
        id: 'created-fallback',
        listing_id: listingA1,
        status: 'COMPLETED',
        checkin_date: '2026-08-01',
        checkout_date: '2026-08-03',
        confirmed_at: null,
        created_at: new Date('2026-08-05T10:00:00.000Z'),
        total_paid: 200,
        guest_fee: 20,
        host_fee: 10,
        payout_amount: 170,
      }),
    ]);

    const thisMonth = await service.getHostAnalytics(
      hostA,
      'this_month',
      frozenAt,
    );
    expect(thisMonth.properties[0].earnings.gross_revenue).toBe(200);

    const prev = await service.getHostAnalytics(
      hostA,
      'previous_month',
      frozenAt,
    );
    expect(prev.period.start).toBe('2026-07-01');
    expect(prev.period.end_exclusive).toBe('2026-08-01');
    expect(prev.properties[0].earnings.gross_revenue).toBe(100);
  });

  it('resolves next_30d period and uses check-in window for earnings', async () => {
    listingRepo.find.mockResolvedValue([
      listing({ id: listingA1, host_user_id: hostA }),
    ]);
    bookingRepo.find.mockResolvedValue([
      booking({
        id: 'soon',
        listing_id: listingA1,
        status: 'CONFIRMED',
        checkin_date: '2026-08-20',
        checkout_date: '2026-08-22',
        confirmed_at: new Date('2026-07-01T10:00:00.000Z'),
        created_at: new Date('2026-07-01T10:00:00.000Z'),
        total_paid: 400,
        guest_fee: 40,
        host_fee: 20,
        payout_amount: 340,
      }),
      booking({
        id: 'completed-window',
        listing_id: listingA1,
        status: 'COMPLETED',
        checkin_date: '2026-08-15',
        checkout_date: '2026-08-16',
        confirmed_at: new Date('2026-08-01T10:00:00.000Z'),
        created_at: new Date('2026-08-01T10:00:00.000Z'),
        total_paid: 100,
        payout_amount: 80,
      }),
    ]);

    const result = await service.getHostAnalytics(hostA, 'next_30d', frozenAt);
    expect(result.period.id).toBe('next_30d');
    expect(result.period.start).toBe('2026-08-11');
    expect(result.period.end_exclusive).toBe('2026-09-10');
    // Only CONFIRMED/CHECKED_IN in check-in window
    expect(result.properties[0].earnings.net_host_earnings).toBe(340);
    expect(result.properties[0].earnings.upcoming_revenue_30d).toBe(340);
  });

  it('supports all_time earnings and null occupancy value', async () => {
    listingRepo.find.mockResolvedValue([
      listing({ id: listingA1, host_user_id: hostA }),
    ]);
    bookingRepo.find.mockResolvedValue([
      booking({
        id: 'old',
        listing_id: listingA1,
        status: 'COMPLETED',
        checkin_date: '2026-01-01',
        checkout_date: '2026-01-04',
        confirmed_at: new Date('2026-01-01T10:00:00.000Z'),
        created_at: new Date('2026-01-01T10:00:00.000Z'),
        total_paid: 300,
        guest_fee: 30,
        host_fee: 15,
        payout_amount: 255,
      }),
    ]);

    const result = await service.getHostAnalytics(hostA, 'all_time', frozenAt);
    expect(result.period.id).toBe('all_time');
    expect(result.properties[0].earnings.gross_revenue).toBe(300);
    expect(result.properties[0].nights.booked_in_period).toBe(3);
    expect(result.properties[0].occupancy.value).toBeNull();
    expect(result.properties[0].occupancy.basis).toBe(
      HOST_ANALYTICS_OCCUPANCY_BASIS,
    );
  });

  it('computes property occupancy as booked nights / period_days', async () => {
    expect(
      bookedNightsInHalfOpenRange(
        '2026-08-01',
        '2026-08-11',
        '2026-08-01',
        '2026-09-01',
      ),
    ).toBe(10);

    listingRepo.find.mockResolvedValue([
      listing({ id: listingA1, host_user_id: hostA }),
    ]);
    bookingRepo.find.mockResolvedValue([
      booking({
        id: 'b1',
        listing_id: listingA1,
        status: 'COMPLETED',
        checkin_date: '2026-08-01',
        checkout_date: '2026-08-11',
        confirmed_at: new Date('2026-08-01T10:00:00.000Z'),
        created_at: new Date('2026-08-01T10:00:00.000Z'),
        total_paid: 100,
        payout_amount: 80,
      }),
    ]);

    const result = await service.getHostAnalytics(hostA, 'this_month', frozenAt);
    expect(result.properties[0].nights.booked_in_period).toBe(10);
    expect(result.properties[0].occupancy.value).toBe(
      Math.round((10 / 31) * 1000) / 10,
    );
  });

  it('exposes listing avg_rating and review_count denorm fields', async () => {
    listingRepo.find.mockResolvedValue([
      listing({
        id: listingA1,
        host_user_id: hostA,
        avg_rating: 4.7 as unknown as number,
        review_count: 12,
      }),
    ]);
    bookingRepo.find.mockResolvedValue([]);

    const result = await service.getHostAnalytics(hostA, 'this_month', frozenAt);
    expect(result.properties[0].reviews.avg_rating).toBe(4.7);
    expect(result.properties[0].reviews.total_reviews).toBe(12);
  });

  it('aggregates multiple listings independently', async () => {
    listingRepo.find.mockResolvedValue([
      listing({ id: listingA1, host_user_id: hostA, title: 'A1' }),
      listing({ id: listingA2, host_user_id: hostA, title: 'A2' }),
    ]);
    bookingRepo.find.mockResolvedValue([
      booking({
        id: 'b1',
        listing_id: listingA1,
        status: 'COMPLETED',
        checkin_date: '2026-08-01',
        checkout_date: '2026-08-03',
        confirmed_at: new Date('2026-08-01T10:00:00.000Z'),
        created_at: new Date('2026-08-01T10:00:00.000Z'),
        total_paid: 100,
        guest_fee: 10,
        host_fee: 5,
        payout_amount: 85,
      }),
      booking({
        id: 'b2',
        listing_id: listingA2,
        status: 'COMPLETED',
        checkin_date: '2026-08-01',
        checkout_date: '2026-08-02',
        confirmed_at: new Date('2026-08-02T10:00:00.000Z'),
        created_at: new Date('2026-08-02T10:00:00.000Z'),
        total_paid: 200,
        guest_fee: 20,
        host_fee: 10,
        payout_amount: 170,
      }),
    ]);

    const result = await service.getHostAnalytics(hostA, 'this_month', frozenAt);
    expect(result.properties).toHaveLength(2);
    const a1 = result.properties.find((p) => p.listing_id === listingA1)!;
    const a2 = result.properties.find((p) => p.listing_id === listingA2)!;
    expect(a1.earnings.gross_revenue).toBe(100);
    expect(a2.earnings.gross_revenue).toBe(200);
    // Property totals reconcile without a host summary block (H7 shape)
    const sumGross = result.properties.reduce(
      (s, p) => s + p.earnings.gross_revenue,
      0,
    );
    expect(sumGross).toBe(300);
  });

  it('isolates Host A from Host B listings and bookings', async () => {
    listingRepo.find.mockImplementation(
      async (opts: { where?: { host_user_id?: string } }) => {
        const host = opts?.where?.host_user_id;
        if (host === hostA) {
          return [
            listing({ id: listingA1, host_user_id: hostA, title: 'A1' }),
            listing({ id: listingA2, host_user_id: hostA, title: 'A2' }),
          ];
        }
        if (host === hostB) {
          return [listing({ id: listingB1, host_user_id: hostB, title: 'B1' })];
        }
        return [];
      },
    );

    const bookingA = booking({
      id: 'ba1',
      listing_id: listingA1,
      status: 'COMPLETED',
      checkin_date: '2026-08-01',
      checkout_date: '2026-08-02',
      confirmed_at: new Date('2026-08-01T10:00:00.000Z'),
      created_at: new Date('2026-08-01T10:00:00.000Z'),
      total_paid: 100,
      guest_fee: 10,
      host_fee: 5,
      payout_amount: 80,
    });
    const bookingB = booking({
      id: 'bb1',
      listing_id: listingB1,
      status: 'COMPLETED',
      checkin_date: '2026-08-01',
      checkout_date: '2026-08-05',
      confirmed_at: new Date('2026-08-01T10:00:00.000Z'),
      created_at: new Date('2026-08-01T10:00:00.000Z'),
      total_paid: 9999,
      guest_fee: 100,
      host_fee: 50,
      payout_amount: 9000,
    });

    bookingRepo.find.mockImplementation(async (opts: { where?: { listing_id?: { _value?: string[]; value?: string[] } } }) => {
      const op = opts?.where?.listing_id;
      const ids = op?._value ?? op?.value ?? [];
      return [bookingA, bookingB].filter((b) => ids.includes(b.listing_id));
    });

    const a = await service.getHostAnalytics(hostA, 'this_month', frozenAt);
    const b = await service.getHostAnalytics(hostB, 'this_month', frozenAt);

    expect(a.properties.map((p) => p.listing_id).sort()).toEqual([
      listingA1,
      listingA2,
    ]);
    expect(a.properties.some((p) => p.listing_id === listingB1)).toBe(false);
    expect(a.properties.reduce((s, p) => s + p.earnings.gross_revenue, 0)).toBe(
      100,
    );

    expect(b.properties.map((p) => p.listing_id)).toEqual([listingB1]);
    expect(b.properties[0].earnings.gross_revenue).toBe(9999);
  });

  it('rejects invalid period and never accepts client hostId', async () => {
    listingRepo.find.mockResolvedValue([]);
    await expect(
      service.getHostAnalytics(hostA, 'last_30_days', frozenAt),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Service signature has no hostId parameter — AuthZ is JWT userId only.
    expect(service.getHostAnalytics.length).toBeGreaterThanOrEqual(1);
  });

  it('loads listings and bookings once (no per-listing N+1)', async () => {
    listingRepo.find.mockResolvedValue([
      listing({ id: listingA1, host_user_id: hostA }),
      listing({ id: listingA2, host_user_id: hostA }),
    ]);
    bookingRepo.find.mockResolvedValue([]);

    await service.getHostAnalytics(hostA, 'this_month', frozenAt);
    expect(listingRepo.find).toHaveBeenCalledTimes(1);
    expect(bookingRepo.find).toHaveBeenCalledTimes(1);
    expect(calendarRepo.find).toHaveBeenCalledTimes(1);
    expect(hostListingsService.getHostListings).toHaveBeenCalledTimes(1);
  });
});

describe('GET /stays/host/analytics controller wiring', () => {
  it('requires JwtAuthGuard and passes user.userId (no hostId)', () => {
    const source = readFileSync(
      join(__dirname, '..', 'stays.controller.ts'),
      'utf8',
    );
    const idx = source.indexOf("@Get('host/analytics')");
    expect(idx).toBeGreaterThan(-1);
    const snippet = source.slice(idx, idx + 900);
    expect(snippet).toMatch(/@UseGuards\(JwtAuthGuard\)/);
    expect(snippet).toMatch(/@ApiBearerAuth\(\)/);
    expect(snippet).toMatch(/user\.userId/);
    expect(snippet).toMatch(/hostAnalyticsService\.getHostAnalytics/);
    expect(snippet).not.toMatch(/hostId/);
  });
});
