import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { StaysMessagingOutbox } from './entities/stays-messaging-outbox.entity';

@Injectable()
export class MessagingOutboxService {
  constructor(
    @InjectRepository(StaysMessagingOutbox)
    private readonly outboxRepo: Repository<StaysMessagingOutbox>,
  ) {}

  async enqueue(
    manager: EntityManager,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const repo = manager.getRepository(StaysMessagingOutbox);
    await repo.save(
      repo.create({
        event_type: eventType,
        payload,
        status: 'PENDING',
        attempts: 0,
        next_retry_at: new Date(),
      }),
    );
  }

  async enqueueDirect(eventType: string, payload: Record<string, unknown>): Promise<void> {
    await this.outboxRepo.save(
      this.outboxRepo.create({
        event_type: eventType,
        payload,
        status: 'PENDING',
        attempts: 0,
        next_retry_at: new Date(),
      }),
    );
  }
}
