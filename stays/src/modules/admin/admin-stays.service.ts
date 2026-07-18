import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs/promises';
import { StaysListing } from '../stays/entities/stays-listing.entity';
import { StaysBooking } from '../stays/entities/stays-booking.entity';
import { StaysHostProfile } from '../stays/entities/stays-host-profile.entity';
import { StaysAuditLog } from '../stays/entities/stays-audit-log.entity';
import { StaysListingReview } from '../stays/entities/stays-listing-review.entity';
import { HostOnboardingService } from '../stays/hosts/host-onboarding.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { StaysService } from '../stays/stays.service';
import { StaysBookingOccupant } from '../stays/entities/stays-booking-occupant.entity';
import { DomainEventsService } from '../../common/events/domain-events.service';
import { EVENTS } from '@nexa/event-bus';

@Injectable()
export class AdminStaysService {
  private static readonly LISTING_UPLOAD_DIR = 'uploads/host';
  private static readonly PHOTO_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

  constructor(
    @InjectRepository(StaysListing)
    private readonly listingRepo: Repository<StaysListing>,
    @InjectRepository(StaysBooking)
    private readonly bookingRepo: Repository<StaysBooking>,
    @InjectRepository(StaysHostProfile)
    private readonly hostProfileRepo: Repository<StaysHostProfile>,
    @InjectRepository(StaysAuditLog)
    private readonly auditRepo: Repository<StaysAuditLog>,
    @InjectRepository(StaysListingReview)
    private readonly reviewRepo: Repository<StaysListingReview>,
    private readonly hostOnboarding: HostOnboardingService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly staysService: StaysService,
    @InjectRepository(StaysBookingOccupant)
    private readonly occupantRepo: Repository<StaysBookingOccupant>,
    private readonly domainEvents: DomainEventsService,
  ) {}

  /** UTC calendar helpers for ops-overview (month/day boundaries). */
  private utcStartOfDay(d = new Date()): Date {
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
  }

  private utcStartOfMonth(d = new Date()): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  }

  private utcDaysAgo(n: number, from = new Date()): Date {
    const d = this.utcStartOfDay(from);
    d.setUTCDate(d.getUTCDate() - n);
    return d;
  }

  private conversionRate(numerator: number, denominator: number): number | null {
    if (!denominator || denominator <= 0) return null;
    return Math.round((numerator / denominator) * 1000) / 10;
  }

  /**
   * Health score formula (Phase 1, evolvable):
   * start 100
   * - min(40, pendingListings * 2 + pendingHosts * 3)
   * - if avgRating > 0 && avgRating < 4: (4 - avgRating) * 10
   * - cancellationRate * 50 (0–1 fraction of cancelled vs cancelled+paid)
   * label: >= 80 Healthy, >= 55 Watch, else Critical
   */
  private computeHealthScore(input: {
    pendingListings: number;
    pendingHosts: number;
    avgRating: number;
    cancellationRate: number;
  }): { score: number; label: 'Healthy' | 'Watch' | 'Critical' } {
    let score = 100;
    score -= Math.min(
      40,
      input.pendingListings * 2 + input.pendingHosts * 3,
    );
    if (input.avgRating > 0 && input.avgRating < 4) {
      score -= (4 - input.avgRating) * 10;
    }
    score -= input.cancellationRate * 50;
    score = Math.max(0, Math.min(100, Math.round(score)));
    const label =
      score >= 80 ? 'Healthy' : score >= 55 ? 'Watch' : 'Critical';
    return { score, label };
  }

  async getOpsOverview() {
    const now = new Date();
    const startOfDay = this.utcStartOfDay(now);
    const startOfYesterday = this.utcDaysAgo(1, now);
    const startOfMonth = this.utcStartOfMonth(now);
    const seriesStart = this.utcDaysAgo(29, now);
    const paidStatuses = ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'];
    const cancelledStatuses = [
      'CANCELLED_BY_GUEST',
      'CANCELLED_BY_HOST',
      'EXPIRED',
    ];
    const submittedPlus = [
      'SUBMITTED',
      'APPROVED',
      'REJECTED',
      'LIVE',
      'PAUSED',
    ];

    const [
      liveListings,
      activeHosts,
      activeBookings,
      pendingListings,
      pendingHostApplications,
      needsChangesListings,
      avgRatingRow,
      todayRevenueRow,
      monthRevenueRow,
      cancelledCount,
      paidCount,
      funnelApplications,
      funnelApproved,
      funnelDraft,
      funnelSubmitted,
      funnelLive,
      funnelFirstBookingRow,
      timingApprovalRow,
      timingDraftRow,
      seriesBookingRows,
      seriesMoneyRows,
      todayListingsApproved,
      todayHostsApproved,
      todayBookings,
      todayReviews,
      todayCancellations,
      yesterdayListingsApproved,
      yesterdayHostsApproved,
      yesterdayBookings,
      yesterdayReviews,
      yesterdayCancellations,
      oldestPendingListingRow,
      oldestPendingHostRow,
    ] = await Promise.all([
      this.listingRepo.count({ where: { status: 'LIVE' } }),
      this.hostProfileRepo.count({ where: { application_status: 'APPROVED' } }),
      this.bookingRepo.count({
        where: { status: In(['CONFIRMED', 'CHECKED_IN']) },
      }),
      this.listingRepo.count({ where: { status: 'SUBMITTED' } }),
      this.hostProfileRepo.count({ where: { application_status: 'PENDING' } }),
      this.listingRepo.count({ where: { status: 'REJECTED' } }),
      this.reviewRepo
        .createQueryBuilder('r')
        .select('COALESCE(AVG(r.rating), 0)', 'avg')
        .where('r.status = :status', { status: 'PUBLISHED' })
        .getRawOne(),
      this.bookingRepo
        .createQueryBuilder('b')
        .select('COALESCE(SUM(b.guest_fee + b.host_fee), 0)', 'total')
        .where('b.status IN (:...statuses)', { statuses: paidStatuses })
        .andWhere(
          '(b.paid_at >= :start OR (b.paid_at IS NULL AND b.created_at >= :start))',
          { start: startOfDay.toISOString() },
        )
        .getRawOne(),
      this.bookingRepo
        .createQueryBuilder('b')
        .select('COALESCE(SUM(b.guest_fee + b.host_fee), 0)', 'total')
        .where('b.status IN (:...statuses)', { statuses: paidStatuses })
        .andWhere(
          '(b.paid_at >= :start OR (b.paid_at IS NULL AND b.created_at >= :start))',
          { start: startOfMonth.toISOString() },
        )
        .getRawOne(),
      this.bookingRepo.count({ where: { status: In(cancelledStatuses) } }),
      this.bookingRepo.count({ where: { status: In(paidStatuses) } }),
      // Funnel MTD: host applications submitted this month
      this.hostProfileRepo
        .createQueryBuilder('h')
        .where(
          `COALESCE(h.submitted_at, h.created_at) >= :start AND h.application_status IN (:...statuses)`,
          {
            start: startOfMonth.toISOString(),
            statuses: ['PENDING', 'APPROVED', 'REJECTED'],
          },
        )
        .getCount(),
      this.hostProfileRepo
        .createQueryBuilder('h')
        .where(
          `h.application_status = :status AND COALESCE(h.reviewed_at, h.submitted_at, h.created_at) >= :start`,
          { status: 'APPROVED', start: startOfMonth.toISOString() },
        )
        .getCount(),
      this.listingRepo
        .createQueryBuilder('l')
        .where('l.created_at >= :start', { start: startOfMonth.toISOString() })
        .getCount(),
      // Approximation: left DRAFT (status in submitted+) and touched MTD
      this.listingRepo
        .createQueryBuilder('l')
        .where('l.status IN (:...statuses)', { statuses: submittedPlus })
        .andWhere('l.last_edited_at >= :start', {
          start: startOfMonth.toISOString(),
        })
        .getCount(),
      // LIVE set this month: audit preferred; fallback LIVE + updated MTD
      this.auditRepo
        .createQueryBuilder('a')
        .where('a.action = :action', { action: 'LISTING_SET_LIVE' })
        .andWhere('a.created_at >= :start', {
          start: startOfMonth.toISOString(),
        })
        .getCount()
        .then(async (n) => {
          if (n > 0) return n;
          return this.listingRepo
            .createQueryBuilder('l')
            .where('l.status = :status', { status: 'LIVE' })
            .andWhere('l.updated_at >= :start', {
              start: startOfMonth.toISOString(),
            })
            .getCount();
        }),
      this.bookingRepo.query(
        `
        SELECT COUNT(*)::int AS count FROM (
          SELECT b.listing_id,
                 MIN(COALESCE(b.paid_at, b.created_at)) AS first_paid
          FROM stays_bookings b
          WHERE b.status = ANY($1)
          GROUP BY b.listing_id
        ) t
        WHERE t.first_paid >= $2
        `,
        [paidStatuses, startOfMonth.toISOString()],
      ),
      this.hostProfileRepo
        .createQueryBuilder('h')
        .select(
          'AVG(EXTRACT(EPOCH FROM (h.reviewed_at - h.submitted_at)) / 3600.0)',
          'avg',
        )
        .where('h.application_status = :status', { status: 'APPROVED' })
        .andWhere('h.reviewed_at >= :start', {
          start: startOfMonth.toISOString(),
        })
        .andWhere('h.submitted_at IS NOT NULL')
        .andWhere('h.reviewed_at IS NOT NULL')
        .getRawOne(),
      // Approximation: last_edited_at ≈ submit time for non-draft listings edited MTD
      this.listingRepo
        .createQueryBuilder('l')
        .select(
          'AVG(EXTRACT(EPOCH FROM (l.last_edited_at - l.created_at)) / 86400.0)',
          'avg',
        )
        .where('l.status IN (:...statuses)', { statuses: submittedPlus })
        .andWhere('l.last_edited_at >= :start', {
          start: startOfMonth.toISOString(),
        })
        .andWhere('l.last_edited_at > l.created_at')
        .getRawOne(),
      this.bookingRepo
        .createQueryBuilder('b')
        .select(`TO_CHAR(b.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')`, 'day')
        .addSelect('COUNT(*)', 'bookings')
        .where('b.created_at >= :start', { start: seriesStart.toISOString() })
        .groupBy('day')
        .orderBy('day', 'ASC')
        .getRawMany(),
      this.bookingRepo
        .createQueryBuilder('b')
        .select(
          `TO_CHAR(COALESCE(b.paid_at, b.created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
          'day',
        )
        .addSelect('COALESCE(SUM(b.total_paid), 0)', 'gmv')
        .addSelect('COALESCE(SUM(b.guest_fee + b.host_fee), 0)', 'revenue')
        .where('b.status IN (:...statuses)', { statuses: paidStatuses })
        .andWhere('COALESCE(b.paid_at, b.created_at) >= :start', {
          start: seriesStart.toISOString(),
        })
        .groupBy('day')
        .orderBy('day', 'ASC')
        .getRawMany(),
      this.auditRepo.count({
        where: {
          action: 'LISTING_APPROVED',
          created_at: MoreThanOrEqual(startOfDay),
        },
      }),
      this.auditRepo.count({
        where: {
          action: 'HOST_ONBOARDING_APPROVED',
          created_at: MoreThanOrEqual(startOfDay),
        },
      }),
      this.bookingRepo.count({
        where: { created_at: MoreThanOrEqual(startOfDay) },
      }),
      this.reviewRepo.count({
        where: { created_at: MoreThanOrEqual(startOfDay) },
      }),
      this.bookingRepo
        .createQueryBuilder('b')
        .where('b.status IN (:...statuses)', { statuses: cancelledStatuses })
        .andWhere('b.updated_at >= :start', {
          start: startOfDay.toISOString(),
        })
        .getCount(),
      this.auditRepo
        .createQueryBuilder('a')
        .where('a.action = :action', { action: 'LISTING_APPROVED' })
        .andWhere('a.created_at >= :start AND a.created_at < :end', {
          start: startOfYesterday.toISOString(),
          end: startOfDay.toISOString(),
        })
        .getCount(),
      this.auditRepo
        .createQueryBuilder('a')
        .where('a.action = :action', { action: 'HOST_ONBOARDING_APPROVED' })
        .andWhere('a.created_at >= :start AND a.created_at < :end', {
          start: startOfYesterday.toISOString(),
          end: startOfDay.toISOString(),
        })
        .getCount(),
      this.bookingRepo
        .createQueryBuilder('b')
        .where('b.created_at >= :start AND b.created_at < :end', {
          start: startOfYesterday.toISOString(),
          end: startOfDay.toISOString(),
        })
        .getCount(),
      this.reviewRepo
        .createQueryBuilder('r')
        .where('r.created_at >= :start AND r.created_at < :end', {
          start: startOfYesterday.toISOString(),
          end: startOfDay.toISOString(),
        })
        .getCount(),
      this.bookingRepo
        .createQueryBuilder('b')
        .where('b.status IN (:...statuses)', { statuses: cancelledStatuses })
        .andWhere('b.updated_at >= :start AND b.updated_at < :end', {
          start: startOfYesterday.toISOString(),
          end: startOfDay.toISOString(),
        })
        .getCount(),
      this.listingRepo
        .createQueryBuilder('l')
        .select('COALESCE(l.last_edited_at, l.created_at)', 'waiting_since')
        .where('l.status = :status', { status: 'SUBMITTED' })
        .orderBy('COALESCE(l.last_edited_at, l.created_at)', 'ASC')
        .limit(1)
        .getRawOne(),
      this.hostProfileRepo
        .createQueryBuilder('h')
        .select('COALESCE(h.submitted_at, h.created_at)', 'waiting_since')
        .where('h.application_status = :status', { status: 'PENDING' })
        .orderBy('COALESCE(h.submitted_at, h.created_at)', 'ASC')
        .limit(1)
        .getRawOne(),
    ]);

    const avgRating = Number(avgRatingRow?.avg || 0);
    const cancellationDenom = cancelledCount + paidCount;
    const cancellationRate =
      cancellationDenom > 0 ? cancelledCount / cancellationDenom : 0;

    const applications = funnelApplications;
    const approved = funnelApproved;
    const draftListings = funnelDraft;
    const submitted = funnelSubmitted;
    const live = typeof funnelLive === 'number' ? funnelLive : 0;
    const firstBooking = Number(
      Array.isArray(funnelFirstBookingRow)
        ? funnelFirstBookingRow[0]?.count ?? 0
        : 0,
    );

    const bookingByDay = new Map(
      (seriesBookingRows as { day: string; bookings: string }[]).map((r) => [
        r.day,
        Number(r.bookings || 0),
      ]),
    );
    const moneyByDay = new Map(
      (
        seriesMoneyRows as { day: string; gmv: string; revenue: string }[]
      ).map((r) => [
        r.day,
        { gmv: Number(r.gmv || 0), revenue: Number(r.revenue || 0) },
      ]),
    );

    const series: {
      date: string;
      bookings: number;
      gmv: number;
      revenue: number;
    }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(seriesStart);
      d.setUTCDate(seriesStart.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      const money = moneyByDay.get(key) ?? { gmv: 0, revenue: 0 };
      series.push({
        date: key,
        bookings: bookingByDay.get(key) ?? 0,
        gmv: money.gmv,
        revenue: money.revenue,
      });
    }

    const avgHoursRaw = timingApprovalRow?.avg;
    const avgDaysRaw = timingDraftRow?.avg;

    const oldestListingAt = oldestPendingListingRow?.waiting_since
      ? new Date(oldestPendingListingRow.waiting_since).toISOString()
      : null;
    const oldestHostAt = oldestPendingHostRow?.waiting_since
      ? new Date(oldestPendingHostRow.waiting_since).toISOString()
      : null;
    const hoursSince = (iso: string | null): number | null => {
      if (!iso) return null;
      return Math.round(((Date.now() - new Date(iso).getTime()) / 3_600_000) * 10) / 10;
    };

    return {
      snapshot: {
        liveListings,
        activeHosts,
        activeBookings,
        revenueToday: Number(todayRevenueRow?.total || 0),
        revenueMonth: Number(monthRevenueRow?.total || 0),
        avgRating: Math.round(avgRating * 10) / 10,
      },
      attention: {
        pendingListings,
        pendingHostApplications,
        pendingKyc: null as number | null,
        needsChangesListings,
        failedPayouts: 0,
        urgentAlerts: 0,
        oldestPendingListingAt: oldestListingAt,
        oldestPendingListingHours: hoursSince(oldestListingAt),
        oldestPendingHostApplicationAt: oldestHostAt,
        oldestPendingHostApplicationHours: hoursSince(oldestHostAt),
      },
      healthScore: this.computeHealthScore({
        pendingListings,
        pendingHosts: pendingHostApplications,
        avgRating,
        cancellationRate,
      }),
      funnel: {
        period: 'mtd_utc',
        stages: [
          {
            key: 'applications',
            label: 'Applications',
            count: applications,
            unit: 'hosts' as const,
          },
          {
            key: 'approved',
            label: 'Approved',
            count: approved,
            unit: 'hosts' as const,
          },
          {
            key: 'draft',
            label: 'Draft Listings',
            count: draftListings,
            unit: 'listings' as const,
          },
          {
            key: 'submitted',
            label: 'Submitted',
            count: submitted,
            unit: 'listings' as const,
          },
          {
            key: 'live',
            label: 'Live',
            count: live,
            unit: 'listings' as const,
          },
          {
            key: 'firstBooking',
            label: 'First Booking',
            count: firstBooking,
            unit: 'listings' as const,
          },
        ],
        conversions: {
          applicationsToApproved: this.conversionRate(approved, applications),
          approvedToDraft: this.conversionRate(draftListings, approved),
          draftToSubmitted: this.conversionRate(submitted, draftListings),
          submittedToLive: this.conversionRate(live, submitted),
          liveToFirstBooking: this.conversionRate(firstBooking, live),
        },
      },
      opsTiming: {
        avgHoursToHostApproval:
          avgHoursRaw != null ? Math.round(Number(avgHoursRaw) * 10) / 10 : null,
        avgDaysDraftToSubmit:
          avgDaysRaw != null ? Math.round(Number(avgDaysRaw) * 10) / 10 : null,
      },
      series,
      activityGrouped: [
        {
          key: 'today',
          label: 'Today',
          listingsApproved: todayListingsApproved,
          hostsApproved: todayHostsApproved,
          bookings: todayBookings,
          reviews: todayReviews,
          cancellations: todayCancellations,
        },
        {
          key: 'yesterday',
          label: 'Yesterday',
          listingsApproved: yesterdayListingsApproved,
          hostsApproved: yesterdayHostsApproved,
          bookings: yesterdayBookings,
          reviews: yesterdayReviews,
          cancellations: yesterdayCancellations,
        },
      ],
    };
  }

  async getStats() {
    const startOfDay = this.utcStartOfDay();

    const [
      totalListings,
      liveListings,
      pendingListings,
      totalHosts,
      pendingHostVerification,
      approvedHosts,
      totalBookings,
      todayBookings,
      confirmedBookings,
    ] = await Promise.all([
      this.listingRepo.count(),
      this.listingRepo.count({ where: { status: 'LIVE' } }),
      this.listingRepo.count({ where: { status: 'SUBMITTED' } }),
      this.hostProfileRepo.count(),
      this.hostProfileRepo.count({ where: { application_status: 'PENDING' } }),
      this.hostProfileRepo.count({ where: { application_status: 'APPROVED' } }),
      this.bookingRepo.count(),
      this.bookingRepo.count({
        where: { created_at: MoreThanOrEqual(startOfDay) },
      }),
      this.bookingRepo.count({ where: { status: 'CONFIRMED' } }),
    ]);

    const revenueRow = await this.bookingRepo
      .createQueryBuilder('b')
      .select('COALESCE(SUM(b.guest_fee + b.host_fee), 0)', 'total')
      .where('b.status IN (:...statuses)', {
        statuses: ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'],
      })
      .getRawOne();

    const todayRevenueRow = await this.bookingRepo
      .createQueryBuilder('b')
      .select('COALESCE(SUM(b.guest_fee + b.host_fee), 0)', 'total')
      .where('b.status IN (:...statuses)', {
        statuses: ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'],
      })
      .andWhere(
        '(b.paid_at >= :start OR (b.paid_at IS NULL AND b.created_at >= :start))',
        { start: startOfDay.toISOString() },
      )
      .getRawOne();

    const totalBookingValueRow = await this.bookingRepo
      .createQueryBuilder('b')
      .select('COALESCE(SUM(b.total_paid), 0)', 'total')
      .where('b.status IN (:...statuses)', {
        statuses: ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'],
      })
      .getRawOne();

    const fees = this.platformSettings.getFeeRates();

    return {
      totalListings,
      liveListings,
      pendingListings,
      totalHosts,
      pendingHostVerification,
      approvedHosts,
      totalBookings,
      todayBookings,
      confirmedBookings,
      totalRevenue: Number(revenueRow?.total || 0),
      todayRevenue: Number(todayRevenueRow?.total || 0),
      totalBookingValue: Number(totalBookingValueRow?.total || 0),
      guest_fee_pct: fees.guest_fee_pct,
      host_fee_pct: fees.host_fee_pct,
      guest_fee_percent: fees.guest_fee_percent,
      host_fee_percent: fees.host_fee_percent,
      total_commission_percent: fees.total_commission_percent,
    };
  }

  async getListingCounts() {
    const [all, pending, approved, rejected, live, paused] = await Promise.all([
      this.listingRepo.count(),
      this.listingRepo.count({ where: { status: 'SUBMITTED' } }),
      this.listingRepo.count({ where: { status: 'APPROVED' } }),
      this.listingRepo.count({ where: { status: 'REJECTED' } }),
      this.listingRepo.count({ where: { status: 'LIVE' } }),
      this.listingRepo.count({ where: { status: 'PAUSED' } }),
    ]);
    return { all, pending, approved, rejected, live, paused };
  }

  async getListings(params?: {
    status?: string;
    limit?: number;
    offset?: number;
    /** oldest = queue wait time (default for pending); newest; priority reserved */
    sort?: 'oldest' | 'newest' | 'priority';
  }) {
    const rawLimit = params?.limit ?? 50;
    const limit = Math.min(Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 50), 100);
    const rawOffset = params?.offset ?? 0;
    const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);
    const status = params?.status;
    const sort = params?.sort;

    const qb = this.listingRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.rate_plan', 'rate_plan')
      .leftJoinAndSelect('l.media', 'media')
      .take(limit)
      .skip(offset);

    if (status && status !== 'all') {
      qb.andWhere('l.status = :status', { status: status.toUpperCase() });
    }

    // Explicit ORDER BY — never rely on implicit ordering
    const effectiveSort =
      sort === 'newest'
        ? 'newest'
        : sort === 'priority'
          ? 'oldest'
          : sort === 'oldest'
            ? 'oldest'
            : status && status.toUpperCase() === 'SUBMITTED'
              ? 'oldest'
              : 'newest';

    if (effectiveSort === 'oldest') {
      qb.orderBy('l.last_edited_at', 'ASC').addOrderBy('l.created_at', 'ASC');
    } else {
      qb.orderBy('l.created_at', 'DESC').addOrderBy('l.id', 'DESC');
    }

    const [items, total] = await qb.getManyAndCount();
    const hostIds = [...new Set(items.map((i) => i.host_user_id))];
    const hosts =
      hostIds.length > 0
        ? await this.hostProfileRepo.find({ where: { user_id: In(hostIds) } })
        : [];
    const hostByUserId = new Map(hosts.map((h) => [h.user_id, h]));

    return {
      items: items.map((l) => ({
        ...l,
        host_profile: hostByUserId.get(l.host_user_id) ?? null,
      })),
      total,
      limit,
      offset,
      hasNext: offset + items.length < total,
      hasPrevious: offset > 0,
    };
  }

  async getListing(id: string) {
    const listing = await this.listingRepo.findOne({
      where: { id },
      relations: ['rules', 'rate_plan', 'check_in_contact', 'media'],
    });
    if (!listing) throw new NotFoundException('Listing not found');
    const host_profile = await this.hostProfileRepo.findOne({
      where: { user_id: listing.host_user_id },
    });
    return { ...listing, host_profile };
  }

  async getListingMediaPath(listingId: string, assetId: string): Promise<string> {
    const listing = await this.listingRepo.findOne({
      where: { id: listingId },
      relations: ['media'],
    });
    if (!listing) throw new NotFoundException('Listing not found');
    const media = listing.media?.find((m) => m.asset_id === assetId);
    if (!media) throw new NotFoundException('Media not found');
    const dir = path.resolve(
      process.cwd(),
      AdminStaysService.LISTING_UPLOAD_DIR,
      listing.host_user_id,
      'listing',
    );
    if (media.kind === 'WALKTHROUGH') {
      const p = path.join(dir, `walkthrough_${assetId}.mp4`);
      try {
        await fs.access(p);
        return p;
      } catch {
        throw new NotFoundException('Walkthrough file not found');
      }
    }
    for (const ext of AdminStaysService.PHOTO_EXTS) {
      const p = path.join(dir, `photo_${assetId}${ext}`);
      try {
        await fs.access(p);
        return p;
      } catch {
        // try next
      }
    }
    throw new NotFoundException('Photo file not found');
  }

  async getHosts(params?: {
    status?: string;
    application_status?: string;
    limit?: number;
    offset?: number;
  }) {
    return this.hostOnboarding.listForAdmin({
      application_status: params?.application_status ?? params?.status,
      limit: params?.limit,
      offset: params?.offset,
    });
  }

  async getBookings(params?: { status?: string; limit?: number; offset?: number }) {
    const { status, limit = 50, offset = 0 } = params || {};
    const qb = this.bookingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.listing', 'listing')
      .orderBy('b.created_at', 'DESC')
      .take(limit)
      .skip(offset);

    if (status && status !== 'all') {
      qb.andWhere('b.status = :status', { status: status.toUpperCase() });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getBooking(id: string) {
    const booking = await this.bookingRepo.findOne({
      where: { id },
      relations: ['listing', 'occupants'],
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return {
      ...booking,
      occupants:
        booking.occupants?.map((o) => ({
          id: o.id,
          full_name: o.full_name,
          id_number: o.id_number ?? null,
          is_primary: o.is_primary,
          phone: o.phone ?? null,
          email: o.email ?? null,
          gender: o.gender ?? null,
          id_document_front_asset_id: o.id_document_front_asset_id ?? null,
          id_document_back_asset_id: o.id_document_back_asset_id ?? null,
          created_at: o.created_at,
        })) ?? [],
    };
  }

  async getOccupantIdDocumentPath(
    bookingId: string,
    occupantId: string,
    side: 'front' | 'back',
  ): Promise<string> {
    const occupant = await this.occupantRepo.findOne({
      where: { id: occupantId, booking_id: bookingId },
      relations: ['booking'],
    });
    if (!occupant) throw new NotFoundException('Occupant not found');
    const assetId =
      side === 'back'
        ? occupant.id_document_back_asset_id
        : occupant.id_document_front_asset_id;
    if (!assetId) throw new NotFoundException('ID document not uploaded');
    const guestUserId = occupant.booking?.guest_user_id;
    if (!guestUserId) throw new NotFoundException('Booking guest not found');
    return this.staysService.getOccupantIdDocumentPath(
      guestUserId,
      assetId,
      side,
    );
  }

  async getReviews(params?: { limit?: number; offset?: number }) {
    const limit = Math.min(params?.limit ?? 50, 200);
    const offset = params?.offset ?? 0;
    const [items, total] = await this.reviewRepo.findAndCount({
      relations: ['listing'],
      order: { created_at: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items, total };
  }

  async getAuditLogs(params?: { limit?: number; offset?: number }) {
    const limit = Math.min(params?.limit ?? 100, 500);
    const offset = params?.offset ?? 0;
    const [items, total] = await this.auditRepo.findAndCount({
      order: { created_at: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items, total };
  }

  async approveHost(
    hostProfileId: string,
    adminUserId: string,
    auditContext?: { ip?: string; userAgent?: string },
  ) {
    return this.hostOnboarding.approve(hostProfileId, adminUserId, auditContext);
  }

  async rejectHost(
    hostProfileId: string,
    reason: string,
    adminUserId: string,
    auditContext?: { ip?: string; userAgent?: string },
  ) {
    return this.hostOnboarding.reject(
      hostProfileId,
      reason,
      adminUserId,
      auditContext,
    );
  }

  async freezeHost(
    hostProfileId: string,
    adminUserId: string,
    auditContext?: { ip?: string; userAgent?: string },
  ) {
    const profile = await this.hostProfileRepo.findOne({
      where: { id: hostProfileId },
    });
    if (!profile) throw new NotFoundException('Host profile not found');
    if (profile.host_verification_status !== 'APPROVED') {
      throw new BadRequestException('Only approved hosts can be frozen');
    }
    profile.listing_frozen = true;
    await this.hostProfileRepo.save(profile);
    await this.auditRepo.save(
      this.auditRepo.create({
        actor_user_id: adminUserId,
        actor_role: 'ADMIN',
        entity_type: 'HOST_PROFILE',
        entity_id: hostProfileId,
        action: 'HOST_LISTING_FROZEN',
        metadata: {},
        ip: auditContext?.ip ?? null,
        user_agent: auditContext?.userAgent ?? null,
      }),
    );
    return {
      listing_frozen: true,
      message: 'Host listing access frozen. They can still book.',
    };
  }

  async unfreezeHost(
    hostProfileId: string,
    adminUserId: string,
    auditContext?: { ip?: string; userAgent?: string },
  ) {
    const profile = await this.hostProfileRepo.findOne({
      where: { id: hostProfileId },
    });
    if (!profile) throw new NotFoundException('Host profile not found');
    profile.listing_frozen = false;
    await this.hostProfileRepo.save(profile);
    await this.auditRepo.save(
      this.auditRepo.create({
        actor_user_id: adminUserId,
        actor_role: 'ADMIN',
        entity_type: 'HOST_PROFILE',
        entity_id: hostProfileId,
        action: 'HOST_LISTING_UNFROZEN',
        metadata: {},
        ip: auditContext?.ip ?? null,
        user_agent: auditContext?.userAgent ?? null,
      }),
    );
    return { listing_frozen: false, message: 'Host can list again.' };
  }

  async approveListing(
    listingId: string,
    adminUserId: string,
    auditContext?: { ip?: string; userAgent?: string },
  ) {
    const listing = await this.listingRepo.findOne({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.status !== 'SUBMITTED') {
      throw new BadRequestException('Only SUBMITTED listings can be approved');
    }
    listing.status = 'APPROVED';
    await this.listingRepo.save(listing);
    await this.auditRepo.save(
      this.auditRepo.create({
        actor_user_id: adminUserId,
        actor_role: 'ADMIN',
        entity_type: 'LISTING',
        entity_id: listingId,
        action: 'LISTING_APPROVED',
        metadata: {},
        ip: auditContext?.ip ?? null,
        user_agent: auditContext?.userAgent ?? null,
      }),
    );
    return { status: 'APPROVED', message: 'Listing approved' };
  }

  async rejectListing(
    listingId: string,
    reason: string,
    adminUserId: string,
    auditContext?: { ip?: string; userAgent?: string },
  ) {
    const listing = await this.listingRepo.findOne({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.status !== 'SUBMITTED') {
      throw new BadRequestException('Only SUBMITTED listings can be rejected');
    }
    listing.status = 'REJECTED';
    await this.listingRepo.save(listing);
    await this.auditRepo.save(
      this.auditRepo.create({
        actor_user_id: adminUserId,
        actor_role: 'ADMIN',
        entity_type: 'LISTING',
        entity_id: listingId,
        action: 'LISTING_REJECTED',
        metadata: { reason },
        ip: auditContext?.ip ?? null,
        user_agent: auditContext?.userAgent ?? null,
      }),
    );
    return { status: 'REJECTED', message: 'Listing rejected' };
  }

  async setListingLive(
    listingId: string,
    adminUserId: string,
    auditContext?: { ip?: string; userAgent?: string },
  ) {
    const listing = await this.listingRepo.findOne({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.status !== 'APPROVED') {
      throw new BadRequestException('Only APPROVED listings can be set LIVE');
    }
    listing.status = 'LIVE';
    await this.listingRepo.save(listing);
    await this.auditRepo.save(
      this.auditRepo.create({
        actor_user_id: adminUserId,
        actor_role: 'ADMIN',
        entity_type: 'LISTING',
        entity_id: listingId,
        action: 'LISTING_SET_LIVE',
        metadata: {},
        ip: auditContext?.ip ?? null,
        user_agent: auditContext?.userAgent ?? null,
      }),
    );
    void this.domainEvents.publish(EVENTS.LISTING_PUBLISHED, 'stays', {
      listingId,
      hostUserId: listing.host_user_id,
    });
    return { status: 'LIVE', message: 'Listing is now live' };
  }

  async checkHealth(): Promise<{ status: string; db: string }> {
    try {
      await this.listingRepo.query('SELECT 1');
      return { status: 'ok', db: 'connected' };
    } catch {
      return { status: 'degraded', db: 'disconnected' };
    }
  }
}
