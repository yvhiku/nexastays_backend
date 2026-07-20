import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MessagingOutboxWorker } from './outbox.worker';
import { StaysMessagingOutbox } from './entities/stays-messaging-outbox.entity';
import { DomainEventsService } from '../../common/events/domain-events.service';

describe('MessagingOutboxWorker', () => {
  let worker: MessagingOutboxWorker;
  let outboxRepo: {
    manager: { query: jest.Mock };
    update: jest.Mock;
    create: jest.Mock;
  };
  let domainEvents: { publish: jest.Mock };

  beforeEach(async () => {
    outboxRepo = {
      manager: {
        query: jest.fn().mockResolvedValue([
          {
            id: 'outbox-1',
            event_type: 'message.received.v1',
            payload: { conversationId: 'c1' },
            status: 'PROCESSING',
            attempts: 0,
            next_retry_at: new Date(),
            created_at: new Date(),
            processed_at: null,
          },
        ]),
      },
      update: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((row) => row),
    };
    domainEvents = { publish: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingOutboxWorker,
        { provide: getRepositoryToken(StaysMessagingOutbox), useValue: outboxRepo },
        { provide: DomainEventsService, useValue: domainEvents },
      ],
    }).compile();

    worker = module.get(MessagingOutboxWorker);
  });

  it('claims rows with SKIP LOCKED and publishes after commit path', async () => {
    const rows = await worker.claimPendingRows(20);
    expect(outboxRepo.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE SKIP LOCKED'),
      [20],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('message.received.v1');
  });

  it('marks row DONE after successful publish', async () => {
    await worker.processOutbox();
    expect(domainEvents.publish).toHaveBeenCalledWith(
      'message.received.v1',
      'stays',
      { conversationId: 'c1' },
    );
    expect(outboxRepo.update).toHaveBeenCalledWith(
      'outbox-1',
      expect.objectContaining({ status: 'DONE' }),
    );
  });

  it('retries with backoff on publish failure', async () => {
    domainEvents.publish.mockRejectedValueOnce(new Error('redis down'));
    await worker.processOutbox();
    expect(outboxRepo.update).toHaveBeenCalledWith(
      'outbox-1',
      expect.objectContaining({ status: 'PENDING', attempts: 1 }),
    );
  });
});
