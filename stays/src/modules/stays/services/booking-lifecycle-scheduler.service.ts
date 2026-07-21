import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { StaysBooking } from '../entities/stays-booking.entity';
import { StaysListing } from '../entities/stays-listing.entity';
import { StaysListingReview } from '../entities/stays-listing-review.entity';
import { DomainEventsService } from '../../../common/events/domain-events.service';
import { EVENTS } from '@nexa/event-bus';
import { MessagingStateService } from '../../messaging/messaging-state.service';
import {
  BookingLifecycleService,
  PAYMENT_PENDING_TTL_MINUTES,
} from './booking-lifecycle.service';

function parseCheckoutDateTime(
  checkoutDate: Date | string,
  checkoutTime: string,
): Date {
  const dateStr =
    checkoutDate instanceof Date
      ? checkoutDate.toISOString().slice(0, 10)
      : String(checkoutDate).slice(0, 10);
  const [hourPart, minutePart] = checkoutTime.split(':');
  const hours = Number(hourPart) || 11;
  const minutes = Number(minutePart) || 0;
  return new Date(dateStr + `T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
}

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
    private readonly messagingState: MessagingStateService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runHourlyLifecycleUpdates(): Promise<void> {
    await Promise.all([
      this.autoCompletePastStays(),
      this.expirePendingPayments(),
      this.sendReviewReminderFollowUps(),
    ]);
  }

  /** Checkout reminder ~1 hour before listing checkout time. */
  @Cron('*/15 * * * *')
  async runCheckoutWindowJobs(): Promise<void> {
    await Promise.all([
      this.sendCheckoutReminders(),
      this.finalizeCheckoutDayStays(),
    ]);
  }

  private async sendCheckoutReminders(): Promise<void> {
    const now = Date.now();
    const bookings = await this.bookingRepo.find({
      where: { status: In(['CONFIRMED', 'CHECKED_IN']) },
      relations: ['listing'],
    });

    for (const booking of bookings) {
      try {
        const listing = booking.listing as StaysListing | undefined;
        const checkoutAt = parseCheckoutDateTime(
          booking.checkout_date,
          listing?.checkout_time ?? '11:00',
        );
        const msUntilCheckout = checkoutAt.getTime() - now;
        // 15-minute cron window: fire once between 45–75 minutes before checkout
        if (msUntilCheckout <= 45 * 60 * 1000 || msUntilCheckout > 75 * 60 * 1000) {
          continue;
        }

        void this.domainEvents.publish(EVENTS.CHECKOUT_REMINDER, 'stays', {
          bookingId: booking.id,
          listingId: booking.listing_id,
          guestUserId: booking.guest_user_id,
          listingTitle: listing?.title,
          checkoutAt: checkoutAt.toISOString(),
        });
        this.logger.log(`Checkout reminder queued for booking ${booking.id}`);
      } catch (err) {
        this.logger.warn(
          `Failed checkout reminder for booking ${booking.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  /** Mark stays completed once checkout time passes on checkout day, then nudge review. */
  private async finalizeCheckoutDayStays(): Promise<void> {
    const now = Date.now();
    const todayStr = new Date().toISOString().slice(0, 10);
    const bookings = await this.bookingRepo.find({
      where: { status: In(['CONFIRMED', 'CHECKED_IN']) },
      relations: ['listing'],
    });

    for (const booking of bookings) {
      const checkoutStr =
        booking.checkout_date instanceof Date
          ? booking.checkout_date.toISOString().slice(0, 10)
          : String(booking.checkout_date).slice(0, 10);
      if (checkoutStr !== todayStr) continue;

      try {
        const listing = booking.listing as StaysListing | undefined;
        const checkoutAt = parseCheckoutDateTime(
          booking.checkout_date,
          listing?.checkout_time ?? '11:00',
        );
        if (checkoutAt.getTime() > now) continue;

        await this.bookingRepo.update(
          { id: booking.id },
          { status: 'COMPLETED', completed_at: new Date() },
        );

        if (listing?.host_user_id) {
          void this.domainEvents.publish(EVENTS.BOOKING_COMPLETED, 'stays', {
            bookingId: booking.id,
            listingId: booking.listing_id,
            hostUserId: listing.host_user_id,
            guestUserId: booking.guest_user_id,
            checkoutDate: checkoutStr,
            listingTitle: listing.title,
          });
        }

        await this.messagingState.enterPostStay(booking.id);
        this.logger.log(`Checkout-day completed booking ${booking.id}`);
      } catch (err) {
        this.logger.warn(
          `Failed checkout-day finalize for booking ${booking.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
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
            listingTitle: listing?.title,
          });
        }

        await this.messagingState.enterPostStay(booking.id);

        this.logger.log(`Auto-completed booking ${booking.id}`);
      } catch (err) {
        this.logger.warn(
          `Failed to auto-complete booking ${booking.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  private readonly reviewReminderStages = [
    { stage: '1h' as const, ms: 60 * 60 * 1000 },
    { stage: '24h' as const, ms: 24 * 60 * 60 * 1000 },
    { stage: '3d' as const, ms: 3 * 24 * 60 * 60 * 1000 },
    { stage: '7d' as const, ms: 7 * 24 * 60 * 60 * 1000 },
  ];

  /** Staged review nudges after checkout (1h, 24h, 3d, 7d). */
  private async sendReviewReminderFollowUps(): Promise<void> {
    const now = Date.now();
    const windowMs = 60 * 60 * 1000;
    const bookings = await this.bookingRepo.find({
      where: { status: 'COMPLETED' },
      relations: ['listing'],
    });

    for (const booking of bookings) {
      if (!booking.completed_at) continue;
      const completedBooking = { ...booking, status: 'COMPLETED' as const };
      if (!this.lifecycleService.canReview(completedBooking)) continue;

      const existing = await this.reviewRepo.findOne({
        where: { booking_id: booking.id },
      });
      if (existing) continue;

      const elapsed = now - booking.completed_at.getTime();
      const listing = booking.listing as StaysListing | undefined;

      for (const { stage, ms } of this.reviewReminderStages) {
        if (elapsed < ms || elapsed >= ms + windowMs) continue;
        void this.domainEvents.publish(EVENTS.REVIEW_REMINDER, 'stays', {
          bookingId: booking.id,
          listingId: booking.listing_id,
          guestUserId: booking.guest_user_id,
          listingTitle: listing?.title,
          reminderStage: stage,
        });
        this.logger.log(`Review reminder (${stage}) queued for booking ${booking.id}`);
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
}
