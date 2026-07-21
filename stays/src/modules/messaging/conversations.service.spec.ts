import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConversationsService } from './conversations.service';
import { StaysConversation } from './entities/stays-conversation.entity';
import { StaysBooking } from '../stays/entities/stays-booking.entity';
import { MessagingPermissionsService } from './permissions.service';
import { MessagesService } from './messages.service';
import { MessagingAuditService } from './audit.service';
import { ConversationProvisionService } from './conversation-provision.service';
import { ConversationPresentationService } from './conversation-presentation.service';
import { SnapshotRepairService } from './snapshot-repair.service';
import { MessagingOutboxService } from './outbox.service';

describe('ConversationsService', () => {
  let service: ConversationsService;
  let convRepo: {
    findOne: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let audit: { log: jest.Mock };

  const guestId = 'guest-uuid';
  const hostId = 'host-uuid';
  const convId = 'conv-uuid';

  const makeConv = (overrides: Partial<StaysConversation> = {}): StaysConversation =>
    ({
      id: convId,
      guest_user_id: guestId,
      host_user_id: hostId,
      type: 'BOOKING',
      messaging_state: 'ACTIVE',
      guest_visibility: 'ACTIVE',
      host_visibility: 'ACTIVE',
      conversation_version: 5,
      reservation_snapshot: {
        listingTitle: 'Riad',
        hostDisplayName: 'Host',
        guestDisplayName: 'Guest',
      },
      unread_guest: 0,
      unread_host: 0,
      last_message_preview: 'Hello',
      last_message_at: new Date(),
      last_message_sequence: '1',
      notification_level_guest: 'ALL',
      notification_level_host: 'ALL',
      blocked_by_guest: false,
      blocked_by_host: false,
      ...overrides,
    }) as StaysConversation;

  beforeEach(async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    convRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(() => qb),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsService,
        MessagingPermissionsService,
        { provide: getRepositoryToken(StaysConversation), useValue: convRepo },
        { provide: getRepositoryToken(StaysBooking), useValue: { findOne: jest.fn() } },
        {
          provide: MessagesService,
          useValue: {
            listMessages: jest.fn().mockResolvedValue({ messages: [], hasMore: false }),
          },
        },
        { provide: MessagingAuditService, useValue: audit },
        {
          provide: ConversationProvisionService,
          useValue: { ensureForBooking: jest.fn() },
        },
        {
          provide: ConversationPresentationService,
          useValue: {
            buildPresentation: jest.fn().mockReturnValue({
              title: 'Host',
              subtitle: 'Upcoming Stay',
              avatar: null,
              bookingChip: null,
              statusChip: null,
              counterpart: { id: hostId, displayName: 'Host' },
              listing: { title: 'Riad' },
              reservation: {},
            }),
            buildSyncMeta: jest.fn().mockReturnValue({
              conversationVersion: 5,
              snapshotVersion: 1,
              lastMessageId: null,
              unreadCount: 0,
              lastReadPointer: { messageId: null, readAt: null },
            }),
          },
        },
        {
          provide: SnapshotRepairService,
          useValue: { isSnapshotIncomplete: jest.fn().mockReturnValue(false) },
        },
        { provide: MessagingOutboxService, useValue: { enqueueDirect: jest.fn() } },
      ],
    }).compile();

    service = module.get(ConversationsService);
  });

  it('filters DELETED conversations from inbox list', async () => {
    await service.listConversations(guestId, 'all');
    const qb = convRepo.createQueryBuilder.mock.results[0].value;
    qb.getMany.mockResolvedValue([
      makeConv({ guest_visibility: 'DELETED' }),
      makeConv({ id: 'conv-2', guest_visibility: 'ACTIVE' }),
    ]);

    const list = await service.listConversations(guestId, 'all');
    expect(list).toHaveLength(1);
    expect(list[0].conversation.id).toBe('conv-2');
  });

  it('hides ARCHIVED unless unread resurfacing badge applies', async () => {
    await service.listConversations(guestId, 'all');
    const qb = convRepo.createQueryBuilder.mock.results[0].value;
    qb.getMany.mockResolvedValue([
      makeConv({ guest_visibility: 'ARCHIVED', unread_guest: 0 }),
      makeConv({ id: 'conv-unread', guest_visibility: 'ARCHIVED', unread_guest: 2 }),
    ]);

    const list = await service.listConversations(guestId, 'all');
    expect(list.map((c) => c.conversation.id)).toEqual(['conv-unread']);
  });

  it('increments conversation_version on visibility archive', async () => {
    convRepo.findOne.mockResolvedValue(makeConv());
    const result = await service.updateVisibility(convId, guestId, 'archive');
    expect(result.conversationVersion).toBe(6);
    expect(convRepo.update).toHaveBeenCalledWith(
      convId,
      expect.objectContaining({ guest_visibility: 'ARCHIVED', conversation_version: 6 }),
    );
  });

  it('applies search filter when q is provided', async () => {
    await service.listConversations(guestId, 'all', 'wifi password');
    const qb = convRepo.createQueryBuilder.mock.results[0].value;
    expect(qb.andWhere).toHaveBeenCalled();
  });
});
