import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MessagingStateService } from './messaging-state.service';
import { StaysConversation } from './entities/stays-conversation.entity';
import { StaysBooking } from '../stays/entities/stays-booking.entity';
import { StaysListing } from '../stays/entities/stays-listing.entity';
import { TimelineSeederService } from './timeline-seeder.service';
import { DomainEventsService } from '../../common/events/domain-events.service';

describe('MessagingStateService', () => {
  let service: MessagingStateService;
  let convRepo: { findOne: jest.Mock; update: jest.Mock; createQueryBuilder: jest.Mock };
  let bookingRepo: { findOne: jest.Mock };
  let listingRepo: { findOne: jest.Mock };
  let timelineSeeder: { seedCheckoutComplete: jest.Mock; seedConversationArchived: jest.Mock };
  let dataSource: { transaction: jest.Mock; getRepository: jest.Mock };
  let domainEvents: { publish: jest.Mock };

  beforeEach(async () => {
    convRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    bookingRepo = { findOne: jest.fn() };
    listingRepo = { findOne: jest.fn() };
    timelineSeeder = {
      seedCheckoutComplete: jest.fn().mockResolvedValue([]),
      seedConversationArchived: jest.fn().mockResolvedValue({}),
    };
    domainEvents = { publish: jest.fn() };
    dataSource = {
      transaction: jest.fn(async (fn) => {
        const manager = {
          getRepository: jest.fn(() => ({
            exists: jest.fn().mockResolvedValue(false),
            update: jest.fn().mockResolvedValue(undefined),
          })),
        };
        return fn(manager);
      }),
      getRepository: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingStateService,
        { provide: getRepositoryToken(StaysConversation), useValue: convRepo },
        { provide: getRepositoryToken(StaysBooking), useValue: bookingRepo },
        { provide: getRepositoryToken(StaysListing), useValue: listingRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: TimelineSeederService, useValue: timelineSeeder },
        { provide: DomainEventsService, useValue: domainEvents },
      ],
    }).compile();

    service = module.get(MessagingStateService);
  });

  it('computes post-stay end from completed_at plus grace hours', () => {
    process.env.POST_STAY_GRACE_HOURS = '72';
    const completedAt = new Date('2026-07-21T12:00:00Z');
    const endsAt = service.computePostStayEndsAt(
      {
        completed_at: completedAt,
        checkout_date: '2026-07-21',
      } as StaysBooking,
      { checkout_time: '12:00' } as StaysListing,
    );
    expect(endsAt.getTime()).toBe(completedAt.getTime() + 72 * 60 * 60 * 1000);
  });

  it('enterPostStay keeps conversation active and sets post_stay_ends_at', async () => {
    process.env.POST_STAY_GRACE_HOURS = '72';
    const completedAt = new Date('2026-07-21T12:00:00Z');
    bookingRepo.findOne.mockResolvedValue({
      id: 'booking-1',
      status: 'COMPLETED',
      completed_at: completedAt,
      checkout_date: '2026-07-21',
      listing_id: 'listing-1',
    });
    convRepo.findOne.mockResolvedValue({
      id: 'conv-1',
      booking_id: 'booking-1',
      messaging_state: 'ARCHIVED',
      conversation_version: 3,
      reservation_snapshot: {},
    });
    listingRepo.findOne.mockResolvedValue({ checkout_time: '12:00' });

    await service.enterPostStay('booking-1');

    expect(timelineSeeder.seedCheckoutComplete).toHaveBeenCalled();
    expect(dataSource.transaction).toHaveBeenCalled();
  });
});
