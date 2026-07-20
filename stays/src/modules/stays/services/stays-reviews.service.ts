import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In } from 'typeorm';
import { EVENTS } from '@nexa/event-bus';
import { DomainEventsService } from '../../../common/events/domain-events.service';
import { StaysListing } from '../entities/stays-listing.entity';
import { StaysBooking } from '../entities/stays-booking.entity';
import { StaysBookingOccupant } from '../entities/stays-booking-occupant.entity';
import {
  StaysListingReview,
  type ReviewStatus,
} from '../entities/stays-listing-review.entity';
import { StaysReviewMedia } from '../entities/stays-review-media.entity';
import { BookingLifecycleService } from './booking-lifecycle.service';
import { ReviewAggregateService } from '../reviews/review-aggregate.service';

const ALLOWED_RATINGS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;
const PUBLISHED: ReviewStatus = 'PUBLISHED';

export type ReviewSort = 'newest' | 'highest' | 'lowest';

@Injectable()
export class StaysReviewsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(StaysListingReview)
    private readonly reviewRepo: Repository<StaysListingReview>,
    @InjectRepository(StaysReviewMedia)
    private readonly reviewMediaRepo: Repository<StaysReviewMedia>,
    @InjectRepository(StaysListing)
    private readonly listingRepo: Repository<StaysListing>,
    private readonly lifecycleService: BookingLifecycleService,
    private readonly aggregateService: ReviewAggregateService,
    private readonly domainEvents: DomainEventsService,
  ) {}

  validateRating(rating: number): number {
    const n = Math.round(Number(rating) * 2) / 2;
    if (!ALLOWED_RATINGS.includes(n)) {
      throw new BadRequestException(
        'Rating must be in 0.5 increments between 0.5 and 5',
      );
    }
    return n;
  }

  async hasReviewForBooking(bookingId: string): Promise<boolean> {
    const count = await this.reviewRepo.count({ where: { booking_id: bookingId } });
    return count > 0;
  }

  async getReviewedBookingIds(bookingIds: string[]): Promise<Set<string>> {
    const map = await this.getReviewedBookingRatings(bookingIds);
    return new Set(map.keys());
  }

  /** bookingId → rating for guest booking list cards */
  async getReviewedBookingRatings(
    bookingIds: string[],
  ): Promise<Map<string, number>> {
    if (bookingIds.length === 0) return new Map();
    const rows = await this.reviewRepo.find({
      where: { booking_id: In(bookingIds) },
      select: ['booking_id', 'rating'],
    });
    return new Map(rows.map((r) => [r.booking_id, Number(r.rating)]));
  }

  async getReviewRatingForBooking(bookingId: string): Promise<number | null> {
    const row = await this.reviewRepo.findOne({
      where: { booking_id: bookingId },
      select: ['rating'],
    });
    return row ? Number(row.rating) : null;
  }

  async getReviewByBookingId(bookingId: string, guestUserId?: string) {
    const review = await this.reviewRepo.findOne({
      where: { booking_id: bookingId },
      relations: ['media'],
    });
    if (!review) {
      throw new NotFoundException('Review not found');
    }
    if (!guestUserId || review.guest_user_id !== guestUserId) {
      throw new NotFoundException('Review not found');
    }
    return this.toReviewResponse(review);
  }

  async listListingReviews(
    listingId: string,
    page = 1,
    limit = 10,
    sort: ReviewSort = 'newest',
  ) {
    const listing = await this.listingRepo.findOne({ where: { id: listingId } });
    if (!listing || listing.status !== 'LIVE') {
      throw new NotFoundException('Listing not found');
    }

    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const safePage = Math.max(page, 1);
    const skip = (safePage - 1) * safeLimit;

    const order =
      sort === 'highest'
        ? { rating: 'DESC' as const, created_at: 'DESC' as const }
        : sort === 'lowest'
          ? { rating: 'ASC' as const, created_at: 'DESC' as const }
          : { created_at: 'DESC' as const };

    const [rows, total] = await this.reviewRepo.findAndCount({
      where: { listing_id: listingId, status: PUBLISHED },
      relations: ['media', 'booking', 'booking.occupants'],
      order,
      take: safeLimit,
      skip,
    });

    const distribution = {
      '5': listing.ratings_5 ?? 0,
      '4': listing.ratings_4 ?? 0,
      '3': listing.ratings_3 ?? 0,
      '2': listing.ratings_2 ?? 0,
      '1': listing.ratings_1 ?? 0,
    };

    const countAll = listing.review_count ?? 0;
    const distribution_pct: Record<string, number> = {};
    for (const star of ['5', '4', '3', '2', '1']) {
      const c = distribution[star as keyof typeof distribution] ?? 0;
      distribution_pct[star] = countAll > 0 ? c / countAll : 0;
    }

    return {
      reviews: rows.map((r) => this.toPublicReview(r)),
      summary: {
        overall_avg_rating:
          listing.avg_rating != null ? Number(listing.avg_rating) : null,
        total_count: countAll,
        distribution,
        distribution_pct,
      },
      page: safePage,
      limit: safeLimit,
      total,
    };
  }

  async createReview(
    guestUserId: string,
    bookingId: string,
    body: { rating: number; comment?: string; assetIds?: string[] },
  ) {
    const rating = this.validateRating(body.rating);
    const comment = (body.comment ?? '').trim();
    if (comment.length > 1000) {
      throw new BadRequestException('Comment is too long (max 1000 characters)');
    }
    const assetIds = (body.assetIds ?? []).slice(0, 5);

    return this.dataSource.transaction(async (manager) => {
      const booking = await this.assertCanReview(manager, guestUserId, bookingId);

      const listing = booking.listing as StaysListing;
      const reviewRepo = manager.getRepository(StaysListingReview);
      const mediaRepo = manager.getRepository(StaysReviewMedia);

      const row = reviewRepo.create({
        listing_id: booking.listing_id,
        booking_id: booking.id,
        guest_user_id: guestUserId,
        host_user_id: listing.host_user_id,
        rating,
        comment: comment.length ? comment : null,
        status: PUBLISHED,
      });
      await reviewRepo.save(row);

      if (assetIds.length > 0) {
        await this.saveMedia(mediaRepo, row.id, assetIds, guestUserId);
      }

      await this.aggregateService.recalculateForListing(
        manager,
        booking.listing_id,
      );

      const saved = await reviewRepo.findOne({
        where: { id: row.id },
        relations: ['media', 'booking', 'booking.occupants'],
      });

      void this.domainEvents.publish(EVENTS.REVIEW_CREATED, 'stays', {
        reviewId: row.id,
        bookingId: booking.id,
        listingId: booking.listing_id,
        hostUserId: listing.host_user_id,
        guestUserId,
        rating: String(rating),
      });

      return this.toReviewResponse(saved!);
    });
  }

  async updateReview(
    guestUserId: string,
    reviewId: string,
    body: { rating?: number; comment?: string; assetIds?: string[] },
  ) {
    return this.dataSource.transaction(async (manager) => {
      const reviewRepo = manager.getRepository(StaysListingReview);
      const mediaRepo = manager.getRepository(StaysReviewMedia);

      const review = await reviewRepo.findOne({
        where: { id: reviewId },
        relations: ['media'],
      });
      if (!review) throw new NotFoundException('Review not found');
      if (review.guest_user_id !== guestUserId) {
        throw new ForbiddenException('ReviewNotAllowed');
      }
      if (review.status === 'REMOVED') {
        throw new ForbiddenException('ReviewNotAllowed');
      }

      const age = Date.now() - review.created_at.getTime();
      if (age > EDIT_WINDOW_MS) {
        throw new ForbiddenException('Review edit window has expired');
      }

      if (body.rating != null) {
        review.rating = this.validateRating(body.rating);
      }
      if (body.comment !== undefined) {
        const comment = body.comment.trim();
        if (comment.length > 1000) {
          throw new BadRequestException('Comment is too long');
        }
        review.comment = comment.length ? comment : null;
      }
      review.edited_at = new Date();
      await reviewRepo.save(review);

      if (body.assetIds !== undefined) {
        await mediaRepo.delete({ review_id: review.id });
        const assetIds = body.assetIds.slice(0, 5);
        if (assetIds.length > 0) {
          await this.saveMedia(mediaRepo, review.id, assetIds, guestUserId);
        }
      }

      await this.aggregateService.recalculateForListing(
        manager,
        review.listing_id,
      );

      const updated = await reviewRepo.findOne({
        where: { id: reviewId },
        relations: ['media', 'booking', 'booking.occupants'],
      });

      void this.domainEvents.publish(EVENTS.REVIEW_UPDATED, 'stays', {
        reviewId: review.id,
        listingId: review.listing_id,
        guestUserId,
      });

      return this.toReviewResponse(updated!);
    });
  }

  async adminSetReviewStatus(reviewId: string, status: ReviewStatus) {
    return this.dataSource.transaction(async (manager) => {
      const reviewRepo = manager.getRepository(StaysListingReview);
      const review = await reviewRepo.findOne({ where: { id: reviewId } });
      if (!review) throw new NotFoundException('Review not found');

      review.status = status;
      await reviewRepo.save(review);
      await this.aggregateService.recalculateForListing(
        manager,
        review.listing_id,
      );

      if (status === 'REMOVED') {
        void this.domainEvents.publish(EVENTS.REVIEW_DELETED, 'stays', {
          reviewId: review.id,
          listingId: review.listing_id,
        });
      } else if (status === 'PUBLISHED') {
        void this.domainEvents.publish(EVENTS.REVIEW_UPDATED, 'stays', {
          reviewId: review.id,
          listingId: review.listing_id,
          guestUserId: review.guest_user_id,
        });
      }

      return { id: review.id, status: review.status };
    });
  }

  async listHostReviews(hostUserId: string, page = 1, limit = 20) {
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
      where: { listing_id: In(listingIds), status: PUBLISHED },
    });

    const rows = await this.reviewRepo.find({
      where: { listing_id: In(listingIds), status: PUBLISHED },
      relations: ['listing', 'booking', 'booking.occupants'],
      order: { created_at: 'DESC' },
      take: safeLimit,
      skip,
    });

    let sum = 0;
    let countAll = 0;
    const starCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const lid of listingIds) {
      const listing = await this.listingRepo.findOne({ where: { id: lid } });
      if (!listing) continue;
      sum += Number(listing.avg_rating ?? 0) * (listing.review_count ?? 0);
      countAll += listing.review_count ?? 0;
      starCounts[1] += listing.ratings_1 ?? 0;
      starCounts[2] += listing.ratings_2 ?? 0;
      starCounts[3] += listing.ratings_3 ?? 0;
      starCounts[4] += listing.ratings_4 ?? 0;
      starCounts[5] += listing.ratings_5 ?? 0;
    }

    const overall =
      countAll > 0 ? Math.round((sum / countAll) * 100) / 100 : null;

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
          guest_name: this.resolveGuestName(r),
          rating: Number(r.rating),
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

  async adminListReviews(params?: {
    limit?: number;
    offset?: number;
    status?: ReviewStatus;
  }) {
    const limit = Math.min(params?.limit ?? 50, 200);
    const offset = params?.offset ?? 0;
    const where = params?.status ? { status: params.status } : {};
    const [items, total] = await this.reviewRepo.findAndCount({
      where,
      relations: ['listing', 'media'],
      order: { created_at: 'DESC' },
      take: limit,
      skip: offset,
    });
    return {
      items: items.map((r) => this.toReviewResponse(r)),
      total,
    };
  }

  async getReviewMediaPath(assetId: string): Promise<string> {
    const media = await this.reviewMediaRepo.findOne({
      where: { asset_id: assetId },
      relations: ['review'],
    });
    if (!media) throw new NotFoundException('Media not found');
    const review = media.review as StaysListingReview;
    if (review.status !== PUBLISHED) {
      throw new NotFoundException('Media not found');
    }

    const root = process.env.MEDIA_STORAGE_ROOT ?? 'uploads';
    const extensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const fs = await import('fs/promises');
    const path = await import('path');

    const ownerDirs = [
      path.join(root, 'reviews', review.guest_user_id),
      path.join(root, 'reviews'), // legacy flat path
    ];

    for (const base of ownerDirs) {
      for (const ext of extensions) {
        const candidate = path.join(base, `review_${assetId}${ext}`);
        try {
          await fs.access(candidate);
          return path.resolve(candidate);
        } catch {
          // try next
        }
      }
    }

    const remoteUrl = process.env.MEDIA_SERVICE_URL;
    if (remoteUrl) {
      return `${remoteUrl.replace(/\/$/, '')}/api/v1/media/file?key=${encodeURIComponent(`stays/reviews/${review.guest_user_id}/review_${assetId}`)}`;
    }

    throw new NotFoundException('Media file not found');
  }

  private async assertCanReview(
    manager: EntityManager,
    guestUserId: string,
    bookingId: string,
  ): Promise<StaysBooking & { listing: StaysListing; occupants?: StaysBookingOccupant[] }> {
    const bookingRepo = manager.getRepository(StaysBooking);
    const reviewRepo = manager.getRepository(StaysListingReview);

    const booking = await bookingRepo.findOne({
      where: { id: bookingId },
      relations: ['listing', 'occupants'],
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.guest_user_id !== guestUserId) {
      throw new ForbiddenException('ReviewNotAllowed');
    }

    const lifecycle = this.lifecycleService.computeLifecycle(booking);
    if (!this.lifecycleService.canReview(booking)) {
      throw new ForbiddenException('ReviewNotAllowed');
    }

    const paidCompleteStatuses: StaysBooking['status'][] = [
      'CONFIRMED',
      'CHECKED_IN',
    ];
    if (
      lifecycle === 'COMPLETED' &&
      paidCompleteStatuses.includes(booking.status)
    ) {
      const completedAt = booking.completed_at ?? new Date();
      await bookingRepo.update(
        { id: booking.id },
        { status: 'COMPLETED', completed_at: completedAt },
      );
      booking.status = 'COMPLETED';
      booking.completed_at = completedAt;
    }

    const listing = booking.listing as StaysListing;
    const reviewableListingStatuses: StaysListing['status'][] = [
      'LIVE',
      'PAUSED',
      'APPROVED',
    ];
    if (!listing || !reviewableListingStatuses.includes(listing.status)) {
      throw new ForbiddenException('ReviewNotAllowed');
    }
    if (listing.host_user_id === guestUserId) {
      throw new ForbiddenException('ReviewOwnListingNotAllowed');
    }

    const existing = await reviewRepo.findOne({
      where: { booking_id: bookingId },
    });
    if (existing) {
      throw new ConflictException('ReviewAlreadyExists');
    }

    return booking as StaysBooking & {
      listing: StaysListing;
      occupants?: StaysBookingOccupant[];
    };
  }

  private async saveMedia(
    mediaRepo: Repository<StaysReviewMedia>,
    reviewId: string,
    assetIds: string[],
    ownerUserId: string,
  ) {
    const root = process.env.MEDIA_STORAGE_ROOT ?? 'uploads';
    const path = await import('path');
    const fs = await import('fs/promises');
    const extensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const ownerDir = path.join(root, 'reviews', ownerUserId);
    const claimDir = path.join(ownerDir, 'claims');

    for (let i = 0; i < assetIds.length; i++) {
      const assetId = assetIds[i];
      let owned = false;
      try {
        await fs.access(path.join(claimDir, assetId));
        owned = true;
      } catch {
        for (const ext of extensions) {
          try {
            await fs.access(path.join(ownerDir, `review_${assetId}${ext}`));
            owned = true;
            break;
          } catch {
            // try next
          }
        }
      }
      if (!owned) {
        throw new BadRequestException(
          'Invalid review media asset_id (must be uploaded by the current user)',
        );
      }
      await mediaRepo.save(
        mediaRepo.create({
          review_id: reviewId,
          asset_id: assetId,
          display_order: i,
        }),
      );
    }
  }

  private resolveGuestName(review: StaysListingReview): string {
    const booking = review.booking as StaysBooking & {
      occupants?: StaysBookingOccupant[];
    };
    const occupants = booking?.occupants ?? [];
    if (occupants.length > 0) {
      const primary =
        occupants.find((o) => o.is_primary) ??
        occupants.find((o) => o.full_name?.trim()) ??
        occupants[0];
      const full = primary?.full_name?.trim() ?? '';
      if (full) {
        const first = full.split(/\s+/)[0];
        return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
      }
    }
    return 'Guest';
  }

  private toPublicReview(review: StaysListingReview) {
    const media = (review.media ?? [])
      .sort((a, b) => a.display_order - b.display_order)
      .map((m) => ({
        asset_id: m.asset_id,
        display_order: m.display_order,
      }));

    return {
      id: review.id,
      listing_id: review.listing_id,
      guest_name: this.resolveGuestName(review),
      guest_photo_url: null as string | null,
      rating: Number(review.rating),
      comment: review.comment ?? '',
      created_at: review.created_at.toISOString(),
      edited_at: review.edited_at?.toISOString() ?? null,
      is_verified_stay: true,
      is_edited: review.edited_at != null,
      media,
      sub_ratings: {} as Record<string, number>,
    };
  }

  private toReviewResponse(review: StaysListingReview) {
    const publicFields = this.toPublicReview(review);
    const editable =
      review.guest_user_id &&
      review.status !== 'REMOVED' &&
      Date.now() - review.created_at.getTime() <= EDIT_WINDOW_MS;

    return {
      ...publicFields,
      booking_id: review.booking_id,
      status: review.status,
      can_edit: editable,
    };
  }
}
