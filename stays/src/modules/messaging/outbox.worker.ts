import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaysMessagingOutbox } from './entities/stays-messaging-outbox.entity';
import { DomainEventsService } from '../../common/events/domain-events.service';

@Injectable()
export class MessagingOutboxWorker {
  private readonly logger = new Logger(MessagingOutboxWorker.name);
  private processing = false;

  constructor(
    @InjectRepository(StaysMessagingOutbox)
    private readonly outboxRepo: Repository<StaysMessagingOutbox>,
    private readonly domainEvents: DomainEventsService,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async processOutbox(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      const rows = await this.claimPendingRows(20);
      for (const row of rows) {
        try {
          await this.domainEvents.publish(
            row.event_type as Parameters<DomainEventsService['publish']>[0],
            'stays',
            row.payload as Record<string, unknown>,
          );
          await this.outboxRepo.update(row.id, {
            status: 'DONE',
            processed_at: new Date(),
          });
        } catch (err) {
          const attempts = row.attempts + 1;
          const delayMs = Math.min(60_000, 1000 * 2 ** attempts);
          this.logger.warn(`Outbox ${row.id} failed attempt ${attempts}: ${err}`);
          await this.outboxRepo.update(row.id, {
            status: attempts >= 5 ? 'FAILED' : 'PENDING',
            attempts,
            next_retry_at: new Date(Date.now() + delayMs),
          });
        }
      }
    } finally {
      this.processing = false;
    }
  }

  /** Atomically claim rows with SKIP LOCKED for multi-instance safety. */
  async claimPendingRows(limit: number): Promise<StaysMessagingOutbox[]> {
    const raw = await this.outboxRepo.manager.query(
      `UPDATE stays_messaging_outbox
       SET status = 'PROCESSING'
       WHERE id IN (
         SELECT id FROM stays_messaging_outbox
         WHERE status IN ('PENDING', 'FAILED')
           AND next_retry_at <= NOW()
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [limit],
    );
    return raw as StaysMessagingOutbox[];
  }
}
