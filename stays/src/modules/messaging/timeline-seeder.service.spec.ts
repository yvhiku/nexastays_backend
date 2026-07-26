import type { EntityManager } from 'typeorm';
import { TimelineSeederService } from './timeline-seeder.service';
import { StaysConversation } from './entities/stays-conversation.entity';
import { StaysMessage } from './entities/stays-message.entity';

describe('TimelineSeederService', () => {
  it('self-heals a stale conversation sequence before inserting', async () => {
    const lockedConversation = {
      id: 'conversation-id',
      last_message_sequence: '6',
      conversation_version: 10,
      guest_user_id: 'guest-id',
      host_user_id: 'host-id',
      unread_guest: 0,
      unread_host: 0,
    } as StaysConversation;

    const conversationQuery = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(lockedConversation),
    };
    const messageQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ maxSequence: '7' }),
    };
    const conversationRepo = {
      createQueryBuilder: jest.fn(() => conversationQuery),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const messageRepo = {
      createQueryBuilder: jest.fn(() => messageQuery),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'message-id', ...value })),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === StaysConversation ? conversationRepo : messageRepo,
      ),
    } as unknown as EntityManager;

    const service = new TimelineSeederService({} as never);
    const saved = await service.insertMessage(manager, lockedConversation, {
      type: 'TEXT',
      body: 'Hello',
      metadata: { source: 'USER' },
      senderId: 'guest-id',
    });

    expect(saved.conversation_sequence).toBe('8');
    expect(conversationRepo.update).toHaveBeenCalledWith(
      lockedConversation.id,
      expect.objectContaining({
        last_message_id: 'message-id',
        last_message_sequence: '8',
      }),
    );
  });
});
