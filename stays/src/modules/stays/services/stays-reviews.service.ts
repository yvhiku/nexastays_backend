import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In } from 'typeorm';
import { StaysListing } from '../entities/stays-listing.entity';
import { StaysBooking } from '../entities/stays-booking.entity';
import { StaysListingReview } from '../entities/stays-listing-review.entity';
import { BookingLifecycleService } from './booking-lifecycle.service';

const REVIEWABLE_STATUSES: StaysBooking['status'][] = [
  'CONFIRMED',
  'CHECKED_IN',
  'COMPLETED',
];

@Injectable()
export class StaysReviewsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(StaysListingReview)
    private readonly reviewRepo: Repository<StaysListingReview>,
    @InjectRepository(StaysListing)
    private readonly listingRepo: Repository<StaysListing>,
    private readonly lifecycleService: BookingLifecycleService,
  ) {}

  /**
   * Public reviews for a listing (newest first).
   */
  async listListingReviews(
    listingId: string,
    page = 1,
    limit = 10,
  ): Promise<{
    reviews: Array<{
      id: string;
      listing_id: string;
      guest_id: string;
      guest_name: string;
      guest_photo_url: string | null;
      rating: number;
      comment: string;
      created_at: string;
      is_verified_stay: boolean;
      sub_ratings: Record<string, number>;
    }>;
    summary: {
      overall_avg_rating: number | null;
      total_count: number;
      distribution_pct: Record<string, number>;
    };
    page: number;
    limit: number;
    total: number;
  }> {
    const listing = await this.listingRepo.findOne({ where: { id: listingId } });
    if (!listing || (listing.status !== 'LIVE' && listing.status !== 'APPROVED')) {
      throw new NotFoundException('Listing not found');
    }

    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const safePage = Math.max(page, 1);
    const skip = (safePage - 1) * safeLimit;

    const [rows, total] = await this.reviewRepo.findAndCount({
      where: { listing_id: listingId },
      order: { created_at: 'DESC' },
      take: safeLimit,
      skip,
    });

    const histRows = await this.reviewRepo
      .createQueryBuilder('r')
      .select('r.rating', 'rating')
      .addSelect('COUNT(*)', 'cnt')
      .where('r.listing_id = :lid', { lid: listingId })
      .groupBy('r.rating')
      .getRawMany<{ rating: string; cnt: string }>();

    let countAll = 0;
    const starCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of histRows) {
      const st = Number(row.rating);
      const c = Number(row.cnt);
      if (starCounts[st] !== undefined) starCounts[st] = c;
      countAll += c;
    }
    let sumWeighted = 0;
    for (let s = 1; s <= 5; s++) sumWeighted += s * (starCounts[s] ?? 0);

    const overall =
      countAll > 0
        ? Math.round((sumWeighted / countAll) * 100) / 100
        : listing.avg_rating != null
          ? Number(listing.avg_rating)
          : null;

    const distribution_pct: Record<string, number> = {};
    for (let s = 5; s >= 1; s--) {
      const c = starCounts[s] ?? 0;
      distribution_pct[String(s)] = countAll > 0 ? c / countAll : 0;
    }

    return {
      reviews: rows.map((r) => ({
        id: r.id,
        listing_id: r.listing_id,
        guest_id: r.guest_user_id,
        guest_name: 'Guest',
        guest_photo_url: null,
        rating: r.rating,
        comment: r.comment ?? '',
        created_at: r.created_at.toISOString(),
        is_verified_stay: true,
        sub_ratings: {} as Record<string, number>,
      })),
      summary: {
        overall_avg_rating: overall,
        total_count: total,
        distribution_pct,
      },
      page: safePage,
      limit: safeLimit,
      total,
    };
  }

  /**
   * Guest submits a review for a stay they booked (after checkout).
   */
  async createReview(
    guestUserId: string,
    bookingId: string,
    body: { rating: number; comment?: string },
  ) {
    const rating = Math.round(Number(body.rating));
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }
    const comment = (body.comment ?? '').trim();
    if (comment.length > 2000) {
      throw new BadRequestException('Comment is too long');
    }

    return this.dataSource.transaction(async (manager) => {
      const bookingRepo = manager.getRepository(StaysBooking);
      const reviewRepo = manager.getRepository(StaysListingReview);

      const booking = await bookingRepo.findOne({
        where: { id: bookingId },
        relations: ['listing'],
      });
      if (!booking) {
        throw new NotFoundException('Booking not found');
      }
      if (booking.guest_user_id !== guestUserId) {
        throw new ForbiddenException('You can only review your own stays');
      }
      if (!REVIEWABLE_STATUSES.includes(booking.status)) {
        throw new BadRequestException(
          'You can only review after the booking is confirmed',
        );
      }

      const lifecycle = this.lifecycleService.computeLifecycle(booking);
      if (lifecycle !== 'COMPLETED') {
        throw new BadRequestException(
          'You can only review after your stay is completed',
        );
      }

      const checkout = new Date(booking.checkout_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      checkout.setHours(0, 0, 0, 0);
      if (checkout > today && booking.status !== 'COMPLETED') {
        throw new BadRequestException('You can review after the checkout date');
      }

      const existing = await reviewRepo.findOne({
        where: { booking_id: bookingId },
      });
      if (existing) {
        throw new ConflictException('You have already reviewed this stay');
      }

      const listing = booking.listing;
      if (!listing || listing.status !== 'LIVE') {
        throw new BadRequestException('Listing is not available for reviews');
      }

      const row = reviewRepo.create({
        listing_id: booking.listing_id,
        booking_id: booking.id,
        guest_user_id: guestUserId,
        rating,
        comment: comment.length ? comment : null,
      });
      await reviewRepo.save(row);
      await this.recalcListingAggregates(manager, booking.listing_id);

      return {
        id: row.id,
        listing_id: row.listing_id,
        booking_id: row.booking_id,
        rating: row.rating,
        comment: row.comment ?? '',
        created_at: row.created_at.toISOString(),
      };
    });
  }

  /**
   * All reviews across the host's listings (newest first) + summary for dashboard.
   */
  async listHostReviews(
    hostUserId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    reviews: Array<{
      id: string;
      listing_id: string;
      listing_title: string;
      guest_name: string;
      rating: number;
      comment: string;
      created_at: string;
    }>;
    summary: {
      overall_avg_rating: number | null;
      total_count: number;
      distribution_pct: Record<string, number>;
    };
    page: number;
    limit: number;
    total: number;
  }> {
    const myListings = await this.listingRepo.find({
      where: { host_user_id: hostUserId },
      select: ['id'],
    });
    const listingIds = myListings.map((l) => l.id);
    if (listingIds.length === 0) {
      return {
        reviews: [],
        summary: {
          overall_avg_rating: null,
          total_count: 0,
          distribution_pct: { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 },
        },
        page: 1,
        limit: Math.min(Math.max(limit, 1), 50),
        total: 0,
      };
    }

    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const safePage = Math.max(page, 1);
    const skip = (safePage - 1) * safeLimit;

    const total = await this.reviewRepo.count({
      where: { listing_id: In(listingIds) },
    });

    const rows = await this.reviewRepo.find({
      where: { listing_id: In(listingIds) },
      relations: ['listing'],
      order: { created_at: 'DESC' },
      take: safeLimit,
      skip,
    });

    const allForHistogram = await this.reviewRepo
      .createQueryBuilder('r')
      .select('r.rating', 'rating')
      .addSelect('COUNT(*)', 'cnt')
      .where('r.listing_id IN (:...ids)', { ids: listingIds })
      .groupBy('r.rating')
      .getRawMany<{ rating: string; cnt: string }>();

    let sumWeighted = 0;
    let countAll = 0;
    const starCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of allForHistogram) {
      const st = Number(row.rating);
      const c = Number(row.cnt);
      if (!starCounts[st]) starCounts[st] = 0;
      starCounts[st] = c;
      sumWeighted += st * c;
      countAll += c;
    }
    const overall =
      countAll > 0
        ? Math.round((sumWeighted / countAll) * 100) / 100
        : null;

    const distribution_pct: Record<string, number> = {};
    for (let s = 5; s >= 1; s--) {
      const c = starCounts[s] ?? 0;
      distribution_pct[String(s)] =
        countAll > 0 ? Math.round((c / countAll) * 1000) / 1000 : 0;
    }

    return {
      reviews: rows.map((r) => {
        const listing = r.listing as StaysListing;
        return {
          id: r.id,
          listing_id: r.listing_id,
          listing_title: listing?.title ?? 'Listing',
          guest_name: 'Guest',
          rating: r.rating,
          comment: r.comment ?? '',
          created_at: r.created_at.toISOString(),
        };
      }),
      summary: {
        overall_avg_rating: overall,
        total_count: total,
        distribution_pct,
      },
      page: safePage,
      limit: safeLimit,
      total,
    };
  }

  private async recalcListingAggregates(manager: EntityManager, listingId: string) {
    const raw = await manager
      .createQueryBuilder(StaysListingReview, 'r')
      .select('COUNT(r.id)::int', 'cnt')
      .addSelect('AVG(r.rating)', 'avg')
      .where('r.listing_id = :listingId', { listingId })
      .getRawOne<{ cnt: string; avg: string | null }>();

    const cnt = raw?.cnt != null ? Number(raw.cnt) : 0;
    const avg =
      cnt > 0 && raw?.avg != null && raw.avg !== ''
        ? Math.round(parseFloat(raw.avg) * 100) / 100
        : null;

    await manager.update(
      StaysListing,
      { id: listingId },
      {
        review_count: cnt,
        avg_rating: avg,
      },
    );
  }
}
