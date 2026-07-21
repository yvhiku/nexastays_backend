import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MessagesService } from './messages.service';
import { StaysConversation } from './entities/stays-conversation.entity';
import { StaysMessage } from './entities/stays-message.entity';
import { MessagingPermissionsService } from './permissions.service';
import { MessagingRateLimitService } from './rate-limit.service';
import { TimelineSeederService } from './timeline-seeder.service';
import { MessagingOutboxService } from './outbox.service';
import { AttachmentService } from './attachment.service';
import { AttachmentSessionService } from './attachment-session.service';
import { ParticipantPresentationService } from './participant-presentation.service';
import { EVENTS } from '@nexa/event-bus';

describe('MessagesService', () => {
  let service: MessagesService;
  let messageRepo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
  };
  let convRepo: { findOne: jest.Mock };
  let outbox: { enqueue: jest.Mock };
  let timelineSeeder: { insertMessage: jest.Mock };
  let transactionManager: {
    getRepository: jest.Mock;
  };

  const guestId = 'guest-uuid';
  const hostId = 'host-uuid';
  const convId = 'conv-uuid';

  const conversation = {
    id: convId,
    guest_user_id: guestId,
    host_user_id: hostId,
    booking_id: 'booking-uuid',
    messaging_state: 'ACTIVE',
    conversation_version: 3,
    last_message_id: 'msg-last',
    reservation_snapshot: {
      listingTitle: 'Riad Test',
      hostDisplayName: 'Host Name',
      guestDisplayName: 'Guest Name',
    },
    blocked_by_guest: false,
    blocked_by_host: false,
    guest_visibility: 'ACTIVE',
    host_visibility: 'ARCHIVED',
    notification_level_guest: 'ALL',
    notification_level_host: 'ALL',
  } as StaysConversation;

  beforeEach(async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 'm2',
          conversation_id: convId,
          conversation_sequence: '2',
          sender_id: hostId,
          type: 'TEXT',
          body: 'Hi',
          metadata: {},
          status: 'PERSISTED',
          sent_at: new Date(),
          delivered_at: null,
          read_at: null,
          is_system: false,
          client_message_id: null,
          created_at: new Date(),
        },
        {
          id: 'm1',
          conversation_id: convId,
          conversation_sequence: '1',
          sender_id: guestId,
          type: 'TEXT',
          body: 'Hello',
          metadata: {},
          status: 'READ',
          sent_at: new Date(),
          delivered_at: null,
          read_at: new Date(),
          is_system: false,
          client_message_id: null,
          created_at: new Date(),
        },
      ]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };

    messageRepo = {
      createQueryBuilder: jest.fn(() => qb),
      findOne: jest.fn(),
    };

    convRepo = {
      findOne: jest.fn().mockResolvedValue(conversation),
    };

    outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };

    timelineSeeder = {
      insertMessage: jest.fn().mockResolvedValue({
        id: 'new-msg',
        conversation_id: convId,
        conversation_sequence: '3',
        sender_id: guestId,
        type: 'TEXT',
        body: 'New text',
        metadata: {},
        status: 'PERSISTED',
        sent_at: new Date(),
        delivered_at: null,
        read_at: null,
        is_system: false,
        client_message_id: 'client-1',
        created_at: new Date(),
      }),
    };

    transactionManager = {
      getRepository: jest.fn((entity) => {
        if (entity === StaysConversation) {
          return {
            findOne: jest.fn().mockResolvedValue({ ...conversation, conversation_version: 4 }),
            createQueryBuilder: jest.fn(() => ({
              update: jest.fn().mockReturnThis(),
              set: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              execute: jest.fn().mockResolvedValue(undefined),
            })),
          };
        }
        return messageRepo;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        MessagingPermissionsService,
        { provide: getRepositoryToken(StaysConversation), useValue: convRepo },
        { provide: getRepositoryToken(StaysMessage), useValue: messageRepo },
        { provide: MessagingRateLimitService, useValue: { assertCanSend: jest.fn() } },
        { provide: TimelineSeederService, useValue: timelineSeeder },
        { provide: MessagingOutboxService, useValue: outbox },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((fn) => fn(transactionManager)),
          },
        },
        {
          provide: AttachmentService,
          useValue: {
            loadForMessages: jest.fn().mockResolvedValue(new Map()),
            linkToMessage: jest.fn(),
          },
        },
        {
          provide: AttachmentSessionService,
          useValue: {
            assertSessionReadyForSend: jest.fn(),
            finalizeSession: jest.fn(),
          },
        },
        {
          provide: ParticipantPresentationService,
          useValue: {
            resolveGuestDisplayName: jest.fn().mockResolvedValue('Guest Name'),
            resolveHostDisplayName: jest.fn().mockResolvedValue('Host Name'),
          },
        },
      ],
    }).compile();

    service = module.get(MessagesService);
  });

  it('paginates messages with before_sequence cursor (chronological ASC)', async () => {
    const result = await service.listMessages(convId, guestId, 30, 3);
    expect(result.hasMore).toBe(false);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].conversationSequence).toBe(1);
    expect(result.messages[1].conversationSequence).toBe(2);
    const qb = messageRepo.createQueryBuilder.mock.results[0].value;
    expect(qb.andWhere).toHaveBeenCalledWith('m.conversation_sequence < :seq', { seq: 3 });
  });

  it('enqueues MESSAGE_RECEIVED with senderName and conversation version on send', async () => {
    await service.sendText(convId, guestId, 'New text', 'client-1');

    expect(outbox.enqueue).toHaveBeenCalledWith(
      transactionManager,
      EVENTS.MESSAGE_RECEIVED,
      expect.objectContaining({
        senderName: 'Guest Name',
        conversationVersion: 4,
        lastMessageId: 'new-msg',
        lastMessageSequence: 3,
        listingTitle: 'Riad Test',
      }),
    );
  });

  it('bumps conversation_version on markRead', async () => {
    messageRepo.findOne.mockResolvedValue({ id: 'msg-last' });
    const convUpdate = jest.fn().mockResolvedValue(undefined);
    transactionManager.getRepository = jest.fn((entity) => {
      if (entity === StaysConversation) {
        return { update: convUpdate };
      }
      return {
        createQueryBuilder: jest.fn(() => ({
          update: jest.fn().mockReturnThis(),
          set: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue(undefined),
        })),
      };
    });

    const result = await service.markRead(convId, guestId);
    expect(result.conversationVersion).toBe(4);
    expect(convUpdate).toHaveBeenCalledWith(
      convId,
      expect.objectContaining({ conversation_version: 4, unread_guest: 0 }),
    );
  });
});
