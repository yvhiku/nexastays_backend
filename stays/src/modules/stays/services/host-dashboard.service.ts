import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { StaysBooking } from '../entities/stays-booking.entity';
import { StaysListing } from '../entities/stays-listing.entity';
import { StaysReviewsService } from './stays-reviews.service';

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

@Injectable()
export class HostDashboardService {
  constructor(
    @InjectRepository(StaysBooking)
    private readonly bookingRepo: Repository<StaysBooking>,
    @InjectRepository(StaysListing)
    private readonly listingRepo: Repository<StaysListing>,
    private readonly staysReviewsService: StaysReviewsService,
  ) {}

  async getHostStats(hostUserId: string) {
    const listings = await this.listingRepo.find({
      where: { host_user_id: hostUserId },
      select: ['id', 'status'],
    });
    const listingIds = listings.map((l) => l.id);

    let bookings: StaysBooking[] = [];
    if (listingIds.length > 0) {
      bookings = await this.bookingRepo.find({
        where: { listing_id: In(listingIds) },
      });
    }

    const hostPayout = (b: StaysBooking) => {
      if (b.payout_amount != null) return Number(b.payout_amount);
      return Math.max(0, Number(b.total_subtotal) - Number(b.host_fee));
    };

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let totalEarnings = 0;
    let thisMonthEarnings = 0;
    for (const b of bookings) {
      if (!EARNING_STATUSES.includes(b.status)) continue;
      const payout = hostPayout(b);
      totalEarnings += payout;
      const refDate = b.confirmed_at ?? b.created_at;
      if (new Date(refDate) >= monthStart) {
        thisMonthEarnings += payout;
      }
    }

    const reviewsPayload = await this.staysReviewsService.listHostReviews(
      hostUserId,
      1,
      1,
    );

    const currency = bookings.find((b) => b.currency)?.currency ?? 'MAD';

    return {
      total_earnings: Math.round(totalEarnings * 100) / 100,
      this_month_earnings: Math.round(thisMonthEarnings * 100) / 100,
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
      live_listings: listings.filter((l) => l.status === 'LIVE').length,
      pending_listings: listings.filter(
        (l) => l.status === 'SUBMITTED' || l.status === 'DRAFT',
      ).length,
      total_listings: listings.length,
      avg_rating: reviewsPayload.summary.overall_avg_rating,
      total_reviews: reviewsPayload.summary.total_count,
    };
  }
}
