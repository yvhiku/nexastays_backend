import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { StaysListing } from '../entities/stays-listing.entity';
import {
  StaysListingReview,
  type ReviewStatus,
} from '../entities/stays-listing-review.entity';

const PUBLISHED: ReviewStatus = 'PUBLISHED';

@Injectable()
export class ReviewAggregateService {
  /** Map half-star rating to histogram bucket 1–5. */
  ratingBucket(rating: number): 1 | 2 | 3 | 4 | 5 {
    const rounded = Math.round(Number(rating));
    return Math.min(5, Math.max(1, rounded)) as 1 | 2 | 3 | 4 | 5;
  }

  async recalculateForListing(
    manager: EntityManager,
    listingId: string,
  ): Promise<void> {
    const rows = await manager.find(StaysListingReview, {
      where: { listing_id: listingId, status: PUBLISHED },
      select: ['rating'],
    });

    const buckets = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;

    for (const row of rows) {
      const r = Number(row.rating);
      sum += r;
      const b = this.ratingBucket(r);
      buckets[b] += 1;
    }

    const count = rows.length;
    const avg =
      count > 0 ? Math.round((sum / count) * 100) / 100 : null;

    await manager.update(
      StaysListing,
      { id: listingId },
      {
        review_count: count,
        avg_rating: avg,
        ratings_1: buckets[1],
        ratings_2: buckets[2],
        ratings_3: buckets[3],
        ratings_4: buckets[4],
        ratings_5: buckets[5],
      },
    );
  }
}
