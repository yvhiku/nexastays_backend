import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DateTime } from 'luxon';
import { HostDashboardService } from './host-dashboard.service';
import { StaysBooking } from '../entities/stays-booking.entity';
import { StaysListing } from '../entities/stays-listing.entity';
import { StaysLedgerEntry } from '../entities/stays-ledger-entry.entity';
import { StaysExternalCalendar } from '../entities/stays-external-calendar.entity';
import { StaysReviewsService } from './stays-reviews.service';
import { BookingLifecycleService } from './booking-lifecycle.service';
import { HostListingsService } from './host-listings.service';
import {
  DASHBOARD_TIMEZONE,
  getDashboardNow,
  toCasablancaYmd,
} from './host-dashboard-timezone';

describe('HostDashboardService.getHostDashboard', () => {
  let service: HostDashboardService;
  let listingRepo: { find: jest.Mock };
  let bookingRepo: { find: jest.Mock };
  let ledgerRepo: { createQueryBuilder: jest.Mock };
  let calendarRepo: { find: jest.Mock };
  let reviewsService: { listHostReviews: jest.Mock };
  let lifecycleService: BookingLifecycleService;
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

  function booking(partial: Record<string, unknown>): StaysBooking {
    return {
      currency: 'MAD',
      guest_fee: 50,
      host_fee: 30,
      total_subtotal: 500,
      total_paid: 580,
      payout_amount: 470,
      occupants: [],
      ...partial,
    } as StaysBooking;
  }

  beforeEach(async () => {
    process.env.STAYS_PAYMENT_PROVIDER = 'mock';
    process.env.NEXA_ENV = 'dogfood';

    listingRepo = { find: jest.fn() };
    bookingRepo = { find: jest.fn() };
    calendarRepo = { find: jest.fn().mockResolvedValue([]) };
    reviewsService = {
      listHostReviews: jest.fn().mockResolvedValue({
        summary: { overall_avg_rating: 4.5, total_count: 2 },
        items: [],
      }),
    };
    hostListingsService = {
      getHostListings: jest.fn().mockResolvedValue([]),
    };

    const qb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    ledgerRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HostDashboardService,
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
        { provide: StaysReviewsService, useValue: reviewsService },
        BookingLifecycleService,
        { provide: HostListingsService, useValue: hostListingsService },
      ],
    }).compile();

    service = module.get(HostDashboardService);
    lifecycleService = module.get(BookingLifecycleService);
  });

  it('returns empty aggregate for host with no listings', async () => {
    listingRepo.find.mockResolvedValue([]);
    const result = await service.getHostDashboard(hostA, frozenAt);

    expect(result.timezone).toBe(DASHBOARD_TIMEZONE);
    expect(result.today.checkins_today).toBe(0);
    expect(result.earnings.net_host_earnings_all_time).toBe(0);
    expect(result.inventory.total_listings).toBe(0);
    expect(result.inventory.occupancy_basis).toBe('BOOKED_OVER_CAPACITY_V1');
    expect(result.messaging).toEqual({
      unread_count: null,
      status: 'unavailable',
    });
    expect(result.payouts.available).toBe(0);
    expect(result.payouts.paid_out).toBe(0);
    expect(result.payouts.disclaimer).toMatch(/simulated/i);
    expect(bookingRepo.find).not.toHaveBeenCalled();
  });

  it('aggregates multi-listing KPIs and money split (gross/net/fees)', async () => {
    listingRepo.find.mockResolvedValue([
      { id: listingA1, status: 'LIVE' },
      { id: listingA2, status: 'DRAFT' },
    ]);
    bookingRepo.find.mockResolvedValue([
      booking({
        id: 'b1',
        listing_id: listingA1,
        status: 'COMPLETED',
        checkin_date: '2026-08-01',
        checkout_date: '2026-08-05',
        confirmed_at: new Date('2026-08-01T10:00:00.000Z'),
        created_at: new Date('2026-07-30T10:00:00.000Z'),
        total_paid: 1000,
        guest_fee: 100,
        host_fee: 50,
        payout_amount: 850,
      }),
      booking({
        id: 'b2',
        listing_id: listingA2,
        status: 'PAYMENT_PENDING',
        checkin_date: '2026-09-01',
        checkout_date: '2026-09-03',
        created_at: new Date('2026-08-11T10:00:00.000Z'),
        total_paid: 0,
        payout_amount: null,
      }),
    ]);

    const result = await service.getHostDashboard(hostA, frozenAt);

    expect(result.inventory.live_listings).toBe(1);
    expect(result.inventory.pending_listings).toBe(1);
    expect(result.inventory.total_listings).toBe(2);
    expect(result.earnings.gross_revenue_all_time).toBe(1000);
    expect(result.earnings.net_host_earnings_all_time).toBe(850);
    expect(result.earnings.platform_fees_all_time).toBe(150);
    expect(result.earnings.this_month.gross_revenue).toBe(1000);
    expect(result.bookings_summary.total).toBe(2);
    expect(result.bookings_summary.pending).toBe(1);
    expect(result.bookings_summary.completed).toBe(1);
    expect(result.today.new_bookings_today).toBe(1);
    expect(result.today.awaiting_guest_payment).toBe(1);
    expect(result.reviews.avg_rating).toBe(4.5);
    expect(result.reviews.total_reviews).toBe(2);
  });

  it('counts check-in/out today/tomorrow and currently staying', async () => {
    listingRepo.find.mockResolvedValue([{ id: listingA1, status: 'LIVE' }]);
    bookingRepo.find.mockResolvedValue([
      booking({
        id: 'cin',
        status: 'CONFIRMED',
        checkin_date: '2026-08-11',
        checkout_date: '2026-08-14',
        created_at: new Date('2026-08-01T10:00:00.000Z'),
        confirmed_at: new Date('2026-08-01T10:00:00.000Z'),
      }),
      booking({
        id: 'cout-today',
        status: 'CHECKED_IN',
        checkin_date: '2026-08-08',
        checkout_date: '2026-08-11',
        created_at: new Date('2026-08-01T10:00:00.000Z'),
        confirmed_at: new Date('2026-08-01T10:00:00.000Z'),
      }),
      booking({
        id: 'cout-tmr',
        status: 'CONFIRMED',
        checkin_date: '2026-08-10',
        checkout_date: '2026-08-12',
        created_at: new Date('2026-08-01T10:00:00.000Z'),
        confirmed_at: new Date('2026-08-01T10:00:00.000Z'),
      }),
    ]);

    const result = await service.getHostDashboard(hostA, frozenAt);
    expect(result.today.checkins_today).toBe(1);
    expect(result.today.checkouts_today).toBe(1);
    expect(result.today.checkouts_tomorrow).toBe(1);
    // cin overlaps today; cout-tmr overlaps today; cout-today ends today (exclusive)
    expect(result.today.currently_staying).toBe(2);
  });

  it('excludes non-earning statuses from money KPIs', async () => {
    listingRepo.find.mockResolvedValue([{ id: listingA1, status: 'LIVE' }]);
    bookingRepo.find.mockResolvedValue([
      booking({
        id: 'pending',
        status: 'INITIATED',
        checkin_date: '2026-08-20',
        checkout_date: '2026-08-22',
        created_at: new Date('2026-08-05T10:00:00.000Z'),
        total_paid: 999,
        payout_amount: 900,
      }),
      booking({
        id: 'cancelled',
        status: 'CANCELLED_BY_GUEST',
        checkin_date: '2026-08-01',
        checkout_date: '2026-08-03',
        created_at: new Date('2026-07-01T10:00:00.000Z'),
        confirmed_at: new Date('2026-07-01T10:00:00.000Z'),
        total_paid: 500,
        payout_amount: 400,
      }),
      booking({
        id: 'ok',
        status: 'CONFIRMED',
        checkin_date: '2026-08-20',
        checkout_date: '2026-08-22',
        created_at: new Date('2026-08-05T10:00:00.000Z'),
        confirmed_at: new Date('2026-08-05T10:00:00.000Z'),
        total_paid: 200,
        guest_fee: 20,
        host_fee: 10,
        payout_amount: 170,
      }),
    ]);

    const result = await service.getHostDashboard(hostA, frozenAt);
    expect(result.earnings.gross_revenue_all_time).toBe(200);
    expect(result.earnings.net_host_earnings_all_time).toBe(170);
    expect(result.earnings.platform_fees_all_time).toBe(30);
    expect(result.earnings.upcoming_revenue_30d).toBe(170);
    expect(result.bookings_summary.cancelled).toBe(1);
  });

  it('computes MoM on net host earnings across Casablanca months', async () => {
    listingRepo.find.mockResolvedValue([{ id: listingA1, status: 'LIVE' }]);
    bookingRepo.find.mockResolvedValue([
      booking({
        id: 'july',
        status: 'COMPLETED',
        checkin_date: '2026-07-10',
        checkout_date: '2026-07-12',
        confirmed_at: new Date('2026-07-15T12:00:00.000Z'),
        created_at: new Date('2026-07-15T12:00:00.000Z'),
        payout_amount: 100,
        total_paid: 120,
        guest_fee: 10,
        host_fee: 10,
      }),
      booking({
        id: 'aug',
        status: 'COMPLETED',
        checkin_date: '2026-08-01',
        checkout_date: '2026-08-03',
        confirmed_at: new Date('2026-08-02T12:00:00.000Z'),
        created_at: new Date('2026-08-02T12:00:00.000Z'),
        payout_amount: 150,
        total_paid: 180,
        guest_fee: 15,
        host_fee: 15,
      }),
    ]);

    const result = await service.getHostDashboard(hostA, frozenAt);
    expect(result.earnings.previous_month.net_host_earnings).toBe(100);
    expect(result.earnings.this_month.net_host_earnings).toBe(150);
    expect(result.earnings.this_month.mom_pct).toBe(50);
  });

  it('sums pending HOST_PAYOUT and keeps available/paid_out at contract defaults when none settled', async () => {
    listingRepo.find.mockResolvedValue([{ id: listingA1, status: 'LIVE' }]);
    bookingRepo.find.mockResolvedValue([]);
    const qb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { amount: 100, status: 'PENDING' },
        { amount: 50.5, status: 'PENDING' },
      ]),
    };
    ledgerRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.getHostDashboard(hostA, frozenAt);
    expect(result.payouts.pending).toBe(150.5);
    expect(result.payouts.available).toBe(0);
    expect(result.payouts.paid_out).toBe(0);
    expect(result.payouts.provider).toBe('mock');
    expect(result.payouts.mode).toBe('dogfood');
  });

  it('counts settled HOST_PAYOUT in paid_out when present', async () => {
    listingRepo.find.mockResolvedValue([{ id: listingA1, status: 'LIVE' }]);
    bookingRepo.find.mockResolvedValue([]);
    const qb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { amount: 40, status: 'PENDING' },
        { amount: 200, status: 'SETTLED' },
      ]),
    };
    ledgerRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.getHostDashboard(hostA, frozenAt);
    expect(result.payouts.pending).toBe(40);
    expect(result.payouts.paid_out).toBe(200);
  });

  it('isolates host A from host B listings and bookings', async () => {
    listingRepo.find.mockImplementation(async ({ where }) => {
      if (where.host_user_id === hostA) {
        return [{ id: listingA1, status: 'LIVE' }];
      }
      if (where.host_user_id === hostB) {
        return [{ id: listingB1, status: 'LIVE' }];
      }
      return [];
    });
    bookingRepo.find.mockImplementation(async ({ where }) => {
      const ids = where.listing_id?.value ?? where.listing_id?._value ?? [];
      const idList = Array.isArray(ids) ? ids : [ids];
      if (idList.includes(listingA1)) {
        return [
          booking({
            id: 'own',
            listing_id: listingA1,
            status: 'COMPLETED',
            checkin_date: '2026-08-01',
            checkout_date: '2026-08-02',
            confirmed_at: new Date('2026-08-01T10:00:00.000Z'),
            created_at: new Date('2026-08-01T10:00:00.000Z'),
            payout_amount: 111,
            total_paid: 130,
            guest_fee: 10,
            host_fee: 9,
          }),
        ];
      }
      if (idList.includes(listingB1)) {
        return [
          booking({
            id: 'other',
            listing_id: listingB1,
            status: 'COMPLETED',
            checkin_date: '2026-08-01',
            checkout_date: '2026-08-02',
            confirmed_at: new Date('2026-08-01T10:00:00.000Z'),
            created_at: new Date('2026-08-01T10:00:00.000Z'),
            payout_amount: 9999,
            total_paid: 9999,
          }),
        ];
      }
      return [];
    });

    const a = await service.getHostDashboard(hostA, frozenAt);
    const b = await service.getHostDashboard(hostB, frozenAt);

    expect(a.earnings.net_host_earnings_all_time).toBe(111);
    expect(b.earnings.net_host_earnings_all_time).toBe(9999);
    expect(listingRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { host_user_id: hostA } }),
    );
  });

  it('uses Africa/Casablanca day boundary for new_bookings_today', async () => {
    // Casablanca midnight 2026-08-11 = 2026-08-10T23:00:00.000Z
    const justBefore = new Date('2026-08-10T22:59:59.000Z');
    const justAfter = new Date('2026-08-10T23:00:01.000Z');
    expect(toCasablancaYmd(justBefore)).toBe('2026-08-10');
    expect(toCasablancaYmd(justAfter)).toBe('2026-08-11');

    listingRepo.find.mockResolvedValue([{ id: listingA1, status: 'LIVE' }]);
    bookingRepo.find.mockResolvedValue([
      booking({
        id: 'old-day',
        status: 'INITIATED',
        checkin_date: '2026-08-20',
        checkout_date: '2026-08-21',
        created_at: justBefore,
      }),
      booking({
        id: 'new-day',
        status: 'INITIATED',
        checkin_date: '2026-08-20',
        checkout_date: '2026-08-21',
        created_at: justAfter,
      }),
    ]);

    const result = await service.getHostDashboard(hostA, frozenAt);
    expect(result.today.new_bookings_today).toBe(1);
  });

  it('getDashboardNow exposes Casablanca bounds', () => {
    const dash = getDashboardNow(
      DateTime.fromISO('2026-08-11T00:30:00', { zone: DASHBOARD_TIMEZONE }),
    );
    expect(dash.timezone).toBe('Africa/Casablanca');
    expect(dash.today).toBe('2026-08-11');
    expect(dash.tomorrow).toBe('2026-08-12');
    expect(dash.thisMonthStart).toBe('2026-08-01');
    expect(dash.previousMonthStart).toBe('2026-07-01');
    expect(dash.previousMonthEndExclusive).toBe('2026-08-01');
  });

  it('does not invent messaging unread counts', async () => {
    listingRepo.find.mockResolvedValue([]);
    const result = await service.getHostDashboard(hostA, frozenAt);
    expect(result.messaging.unread_count).toBeNull();
    expect(result.messaging.status).toBe('unavailable');
  });

  it('documents JwtAuthGuard at controller — service trusts hostUserId arg', () => {
    // AuthZ is JWT → user.userId at GET /stays/host/dashboard (JwtAuthGuard).
    // Service layer isolates by host_user_id filter; unauthorized callers never reach here.
    expect(lifecycleService).toBeDefined();
  });
});
