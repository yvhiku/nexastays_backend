import { Test, TestingModule } from '@nestjs/testing';
import { ConversationProvisionService } from './conversation-provision.service';
import { TimelineSeederService } from './timeline-seeder.service';
import { MessagingOutboxService } from './outbox.service';
import { StaysConversation } from './entities/stays-conversation.entity';
import { StaysListing } from '../stays/entities/stays-listing.entity';
import { EVENTS } from '@nexa/event-bus';

describe('ConversationProvisionService', () => {
  let service: ConversationProvisionService;
  let timelineSeeder: {
    buildSnapshot: jest.Mock;
    seedBookingConfirmed: jest.Mock;
  };
  let outbox: { enqueue: jest.Mock };

  const booking = {
    id: 'booking-uuid',
    guest_user_id: 'guest-uuid',
    listing_id: 'listing-uuid',
    checkin_date: '2026-08-01',
    checkout_date: '2026-08-05',
    guest_count: 2,
    total_paid: 1200,
    currency: 'MAD',
    booking_reference: 'NXA-123',
    payment_intent_id: 'pi_1',
  };

  const listing = {
    id: 'listing-uuid',
    host_user_id: 'host-uuid',
    title: 'Riad Atlas',
    city: 'Marrakech',
    media: [],
  };

  let convRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let listingRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    timelineSeeder = {
      buildSnapshot: jest.fn().mockReturnValue({
        listingTitle: 'Riad Atlas',
        checkinDate: '2026-08-01',
        checkoutDate: '2026-08-05',
        guestCount: 2,
        bookingReference: 'NXA-123',
      }),
      seedBookingConfirmed: jest.fn().mockResolvedValue([]),
    };
    outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };

    convRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((d) => d),
      save: jest.fn((d) => Promise.resolve({ ...d, id: 'conv-new' })),
    };
    listingRepo = {
      findOne: jest.fn().mockResolvedValue(listing),
    };

    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === StaysConversation) return convRepo;
        if (entity === StaysListing) return listingRepo;
        return {};
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationProvisionService,
        { provide: TimelineSeederService, useValue: timelineSeeder },
        { provide: MessagingOutboxService, useValue: outbox },
      ],
    }).compile();

    service = module.get(ConversationProvisionService);

    await service.provisionWithinTransaction(
      manager as never,
      booking as never,
      listing.id,
      'cmi',
      'pi_1',
    );
  });

  it('creates conversation with snapshot v1 inside transaction', () => {
    expect(convRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        booking_id: booking.id,
        snapshot_version: 1,
        conversation_version: 1,
        messaging_state: 'ACTIVE',
      }),
    );
  });

  it('seeds timeline cards on provision', () => {
    expect(timelineSeeder.seedBookingConfirmed).toHaveBeenCalled();
  });

  it('enqueues BOOKING_CONFIRMED and PAYMENT_SUCCEEDED outbox rows', () => {
    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.anything(),
      EVENTS.BOOKING_CONFIRMED,
      expect.objectContaining({ conversationId: 'conv-new' }),
    );
    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.anything(),
      EVENTS.PAYMENT_SUCCEEDED,
      expect.objectContaining({ bookingId: booking.id }),
    );
  });

  it('is idempotent when conversation already exists', async () => {
    convRepo.findOne.mockResolvedValue({ id: 'existing' });
    convRepo.save.mockClear();
    outbox.enqueue.mockClear();

    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === StaysConversation) return convRepo;
        if (entity === StaysListing) return listingRepo;
        return {};
      }),
    };

    const result = await service.provisionWithinTransaction(
      manager as never,
      booking as never,
      listing.id,
    );
    expect(result).toEqual({ id: 'existing' });
    expect(convRepo.save).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });
});
