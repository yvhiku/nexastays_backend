import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { StaysReviewsService } from './stays-reviews.service';
import { StaysListingReview } from '../entities/stays-listing-review.entity';
import { StaysReviewMedia } from '../entities/stays-review-media.entity';
import { StaysListing } from '../entities/stays-listing.entity';
import { StaysBooking } from '../entities/stays-booking.entity';
import { BookingLifecycleService } from './booking-lifecycle.service';
import { ReviewAggregateService } from '../reviews/review-aggregate.service';
import { DomainEventsService } from '../../../common/events/domain-events.service';

describe('StaysReviewsService', () => {
  let service: StaysReviewsService;
  let reviewRepo: {
    count: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    findAndCount: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let listingRepo: { findOne: jest.Mock; find: jest.Mock };
  let lifecycleService: { computeLifecycle: jest.Mock; canReview: jest.Mock };
  let aggregateService: { recalculateForListing: jest.Mock };
  let domainEvents: { publish: jest.Mock };
  let transactionManager: {
    getRepository: jest.Mock;
  };

  const guestId = 'guest-uuid';
  const hostId = 'host-uuid';
  const bookingId = 'booking-uuid';
  const listingId = 'listing-uuid';

  const completedBooking = {
    id: bookingId,
    guest_user_id: guestId,
    listing_id: listingId,
    status: 'COMPLETED',
    checkin_date: '2026-01-01',
    checkout_date: '2026-01-05',
    created_at: new Date('2026-01-01'),
    listing: { id: listingId, host_user_id: hostId, status: 'LIVE' },
    occupants: [{ full_name: 'Jane Doe', is_primary: true }],
  };

  beforeEach(async () => {
    reviewRepo = {
      count: jest.fn().mockResolvedValue(0),
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      create: jest.fn((d) => ({ ...d, id: 'review-uuid', created_at: new Date() })),
      save: jest.fn((d) => Promise.resolve(d)),
    };
    listingRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: listingId,
        status: 'LIVE',
        avg_rating: 4.5,
        review_count: 1,
        ratings_1: 0,
        ratings_2: 0,
        ratings_3: 0,
        ratings_4: 0,
        ratings_5: 1,
      }),
      find: jest.fn(),
    };
    lifecycleService = {
      computeLifecycle: jest.fn().mockReturnValue('COMPLETED'),
      canReview: jest.fn().mockReturnValue(true),
    };
    aggregateService = {
      recalculateForListing: jest.fn().mockResolvedValue(undefined),
    };
    domainEvents = { publish: jest.fn().mockResolvedValue(undefined) };

    const bookingRepo = {
      findOne: jest.fn().mockResolvedValue(completedBooking),
    };
    const mediaRepo = {
      save: jest.fn(),
      delete: jest.fn(),
    };

    transactionManager = {
      getRepository: jest.fn((entity) => {
        if (entity === StaysBooking) return bookingRepo;
        if (entity === StaysListingReview) return reviewRepo;
        if (entity === StaysReviewMedia) return mediaRepo;
        return reviewRepo;
      }),
    };

    const dataSource = {
      transaction: jest.fn((cb) => cb(transactionManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaysReviewsService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(StaysListingReview), useValue: reviewRepo },
        { provide: getRepositoryToken(StaysReviewMedia), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(StaysListing), useValue: listingRepo },
        { provide: BookingLifecycleService, useValue: lifecycleService },
        { provide: ReviewAggregateService, useValue: aggregateService },
        { provide: DomainEventsService, useValue: domainEvents },
      ],
    }).compile();

    service = module.get(StaysReviewsService);
  });

  it('validates half-star ratings', () => {
    expect(service.validateRating(4.5)).toBe(4.5);
    expect(() => service.validateRating(6)).toThrow(BadRequestException);
    expect(() => service.validateRating(0)).toThrow(BadRequestException);
  });

  it('creates a review for a completed booking', async () => {
    reviewRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'review-uuid',
        booking_id: bookingId,
        listing_id: listingId,
        guest_user_id: guestId,
        rating: 5,
        comment: 'Great stay',
        status: 'PUBLISHED',
        created_at: new Date(),
        media: [],
        booking: completedBooking,
      });

    const result = await service.createReview(guestId, bookingId, {
      rating: 5,
      comment: 'Great stay',
    });

    expect(result.rating).toBe(5);
    expect(aggregateService.recalculateForListing).toHaveBeenCalled();
    expect(domainEvents.publish).toHaveBeenCalled();
  });

  it('blocks duplicate reviews', async () => {
    reviewRepo.findOne.mockResolvedValueOnce({ id: 'existing' });

    await expect(
      service.createReview(guestId, bookingId, { rating: 5 }),
    ).rejects.toThrow(ConflictException);
  });

  it('allows review when lifecycle completed but DB status still CONFIRMED', async () => {
    const bookingRepo = {
      findOne: jest.fn().mockResolvedValue({
        ...completedBooking,
        status: 'CONFIRMED',
        completed_at: null,
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    transactionManager.getRepository.mockImplementation((entity) => {
      if (entity === StaysBooking) return bookingRepo;
      if (entity === StaysListingReview) return reviewRepo;
      if (entity === StaysReviewMedia) return { save: jest.fn() };
      return reviewRepo;
    });
    lifecycleService.computeLifecycle.mockReturnValue('COMPLETED');
    reviewRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'review-uuid',
        booking_id: bookingId,
        listing_id: listingId,
        guest_user_id: guestId,
        rating: 5,
        comment: 'Great',
        status: 'PUBLISHED',
        created_at: new Date(),
        media: [],
        booking: completedBooking,
      });

    const result = await service.createReview(guestId, bookingId, {
      rating: 5,
      comment: 'Great',
    });

    expect(bookingRepo.update).toHaveBeenCalledWith(
      { id: bookingId },
      expect.objectContaining({ status: 'COMPLETED' }),
    );
    expect(result.rating).toBe(5);
  });

  it('blocks review when booking not completed', async () => {
    lifecycleService.computeLifecycle.mockReturnValue('ACTIVE');
    lifecycleService.canReview.mockReturnValue(false);
    reviewRepo.findOne.mockResolvedValueOnce(null);

    await expect(
      service.createReview(guestId, bookingId, { rating: 5 }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('blocks unauthorized guest', async () => {
    const bookingRepo = {
      findOne: jest.fn().mockResolvedValue({
        ...completedBooking,
        guest_user_id: 'other-guest',
      }),
    };
    transactionManager.getRepository.mockImplementation((entity) => {
      if (entity === StaysBooking) return bookingRepo;
      if (entity === StaysListingReview) return reviewRepo;
      return reviewRepo;
    });
    reviewRepo.findOne.mockResolvedValueOnce(null);

    await expect(
      service.createReview(guestId, bookingId, { rating: 5 }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('blocks edit after 48h window', async () => {
    const oldDate = new Date(Date.now() - 49 * 60 * 60 * 1000);
    reviewRepo.findOne.mockResolvedValue({
      id: 'review-uuid',
      guest_user_id: guestId,
      status: 'PUBLISHED',
      created_at: oldDate,
      listing_id: listingId,
      media: [],
    });

    await expect(
      service.updateReview(guestId, 'review-uuid', { rating: 4 }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('recalculates aggregates on update', async () => {
    reviewRepo.findOne
      .mockResolvedValueOnce({
        id: 'review-uuid',
        guest_user_id: guestId,
        status: 'PUBLISHED',
        created_at: new Date(),
        listing_id: listingId,
        media: [],
      })
      .mockResolvedValueOnce({
        id: 'review-uuid',
        guest_user_id: guestId,
        status: 'PUBLISHED',
        created_at: new Date(),
        listing_id: listingId,
        rating: 4,
        media: [],
        booking: completedBooking,
      });

    await service.updateReview(guestId, 'review-uuid', { rating: 4 });
    expect(aggregateService.recalculateForListing).toHaveBeenCalled();
  });
});

describe('ReviewAggregateService', () => {
  it('maps ratings to histogram buckets', () => {
    const agg = new ReviewAggregateService();
    expect(agg.ratingBucket(4.5)).toBe(5);
    expect(agg.ratingBucket(4.4)).toBe(4);
    expect(agg.ratingBucket(1)).toBe(1);
  });
});
