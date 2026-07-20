import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In, Between } from 'typeorm';
import { StaysBooking } from '../entities/stays-booking.entity';
import { StaysListing } from '../entities/stays-listing.entity';
import { StaysListingReview } from '../entities/stays-listing-review.entity';
import { DomainEventsService } from '../../../common/events/domain-events.service';
import { EVENTS } from '@nexa/event-bus';
import {
  BookingLifecycleService,
  PAYMENT_PENDING_TTL_MINUTES,
} from './booking-lifecycle.service';

@Injectable()
export class BookingLifecycleSchedulerService {
  private readonly logger = new Logger(BookingLifecycleSchedulerService.name);

  constructor(
    @InjectRepository(StaysBooking)
    private readonly bookingRepo: Repository<StaysBooking>,
    @InjectRepository(StaysListingReview)
    private readonly reviewRepo: Repository<StaysListingReview>,
    private readonly lifecycleService: BookingLifecycleService,
    private readonly domainEvents: DomainEventsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runHourlyLifecycleUpdates(): Promise<void> {
    await Promise.all([
      this.autoCompletePastStays(),
      this.expirePendingPayments(),
      this.sendReviewReminders(),
    ]);
  }

  /** Also invoked on module init in dev for faster feedback. */
  async runOnStartup(): Promise<void> {
    if (process.env.STAYS_LIFECYCLE_SYNC_ON_STARTUP === 'true') {
      await this.runHourlyLifecycleUpdates();
    }
  }

  private async autoCompletePastStays(): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);

    const candidates = await this.bookingRepo.find({
      where: {
        status: In(['CONFIRMED', 'CHECKED_IN']),
        checkout_date: LessThan(todayStr as unknown as Date),
      },
      relations: ['listing'],
    });

    for (const booking of candidates) {
      try {
        await this.bookingRepo.update(
          { id: booking.id },
          { status: 'COMPLETED', completed_at: new Date() },
        );

        const listing = booking.listing as StaysListing;
        const hostUserId = listing?.host_user_id;
        if (hostUserId) {
          void this.domainEvents.publish(EVENTS.BOOKING_COMPLETED, 'stays', {
            bookingId: booking.id,
            listingId: booking.listing_id,
            hostUserId,
            guestUserId: booking.guest_user_id,
            checkoutDate:
              booking.checkout_date instanceof Date
                ? booking.checkout_date.toISOString().slice(0, 10)
                : String(booking.checkout_date),
          });
        }

        this.logger.log(`Auto-completed booking ${booking.id}`);
      } catch (err) {
        this.logger.warn(
          `Failed to auto-complete booking ${booking.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  private async expirePendingPayments(): Promise<void> {
    const cutoff = new Date(
      Date.now() - PAYMENT_PENDING_TTL_MINUTES * 60 * 1000,
    );

    const candidates = await this.bookingRepo.find({
      where: {
        status: In(['PAYMENT_PENDING', 'INITIATED']),
      },
      relations: ['listing'],
    });

    const expired = candidates.filter((b) => b.created_at <= cutoff);

    for (const booking of expired) {
      try {
        await this.bookingRepo.update({ id: booking.id }, { status: 'EXPIRED' });

        void this.domainEvents.publish(EVENTS.PAYMENT_EXPIRED, 'stays', {
          bookingId: booking.id,
          listingId: booking.listing_id,
          guestUserId: booking.guest_user_id,
        });

        this.logger.log(`Expired pending payment booking ${booking.id}`);
      } catch (err) {
        this.logger.warn(
          `Failed to expire booking ${booking.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  /** Remind guests ~24h after checkout to leave a review. */
  private async sendReviewReminders(): Promise<void> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const windowStart = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const startStr = windowStart.toISOString().slice(0, 10);
    const endStr = windowEnd.toISOString().slice(0, 10);

    const completed = await this.bookingRepo.find({
      where: {
        status: 'COMPLETED',
        checkout_date: Between(startStr as unknown as Date, endStr as unknown as Date),
      },
    });

    for (const booking of completed) {
      try {
        if (!this.lifecycleService.canReview(booking)) {
          continue;
        }
        const existing = await this.reviewRepo.findOne({
          where: { booking_id: booking.id },
        });
        if (existing) {
          continue;
        }
        void this.domainEvents.publish(EVENTS.REVIEW_REMINDER, 'stays', {
          bookingId: booking.id,
          listingId: booking.listing_id,
          guestUserId: booking.guest_user_id,
        });
        this.logger.log(`Review reminder queued for booking ${booking.id}`);
      } catch (err) {
        this.logger.warn(
          `Failed review reminder for booking ${booking.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }
}
