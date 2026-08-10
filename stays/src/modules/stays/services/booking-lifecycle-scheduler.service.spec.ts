import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In } from 'typeorm';
import { BookingLifecycleSchedulerService } from './booking-lifecycle-scheduler.service';
import { StaysBooking } from '../entities/stays-booking.entity';
import { StaysListingReview } from '../entities/stays-listing-review.entity';
import { StaysPaymentIntent } from '../entities/stays-payment-intent.entity';
import { BookingLifecycleService, PRE_CONFIRMATION_BOOKING_STATUSES } from './booking-lifecycle.service';
import { DomainEventsService } from '../../../common/events/domain-events.service';
import { MessagingStateService } from '../../messaging/messaging-state.service';

describe('BookingLifecycleSchedulerService — payment expiration guards', () => {
  let service: BookingLifecycleSchedulerService;
  let bookingRepo: { find: jest.Mock; update: jest.Mock };
  let intentRepo: { update: jest.Mock };
  let domainEvents: { publish: jest.Mock };

  beforeEach(async () => {
    bookingRepo = {
      find: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    intentRepo = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    domainEvents = { publish: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingLifecycleSchedulerService,
        BookingLifecycleService,
        { provide: getRepositoryToken(StaysBooking), useValue: bookingRepo },
        { provide: getRepositoryToken(StaysListingReview), useValue: {} },
        { provide: getRepositoryToken(StaysPaymentIntent), useValue: intentRepo },
        { provide: DomainEventsService, useValue: domainEvents },
        { provide: MessagingStateService, useValue: { syncFromBooking: jest.fn() } },
      ],
    }).compile();

    service = module.get(BookingLifecycleSchedulerService);
  });

  async function runExpiration(): Promise<void> {
    await (
      service as unknown as { expirePendingPayments(): Promise<void> }
    ).expirePendingPayments();
  }

  it('Test 6 — expiration updates PAYMENT_PENDING → EXPIRED and cancels pending intents', async () => {
    const oldCreatedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    bookingRepo.find.mockResolvedValue([
      {
        id: 'booking-pending',
        status: 'PAYMENT_PENDING',
        created_at: oldCreatedAt,
        listing_id: 'listing-1',
        guest_user_id: 'guest-1',
      },
    ]);

    await runExpiration();

    expect(bookingRepo.update).toHaveBeenCalledWith(
      { id: 'booking-pending', status: In(PRE_CONFIRMATION_BOOKING_STATUSES) },
      expect.objectContaining({ status: 'EXPIRED' }),
    );
    expect(intentRepo.update).toHaveBeenCalledWith(
      { booking_id: 'booking-pending', status: 'PENDING' },
      expect.objectContaining({ status: 'CANCELLED' }),
    );
    expect(domainEvents.publish).toHaveBeenCalled();
  });

  it('Test 7 — expiration skips event and intent cancel when guarded update affects zero rows', async () => {
    const oldCreatedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    bookingRepo.find.mockResolvedValue([
      {
        id: 'booking-confirmed-race',
        status: 'PAYMENT_PENDING',
        created_at: oldCreatedAt,
        listing_id: 'listing-1',
        guest_user_id: 'guest-1',
      },
    ]);
    bookingRepo.update.mockResolvedValueOnce({ affected: 0 });

    await runExpiration();

    expect(intentRepo.update).not.toHaveBeenCalled();
    expect(domainEvents.publish).not.toHaveBeenCalled();
  });
});
