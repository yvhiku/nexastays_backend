import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaysMessagingOutbox } from './entities/stays-messaging-outbox.entity';
import { DomainEventsService } from '../../common/events/domain-events.service';
import { isMessagingInternalEvent, MESSAGING_INTERNAL_EVENTS } from './messaging-internal.events';
import { SnapshotRepairService } from './snapshot-repair.service';

@Injectable()
export class MessagingOutboxWorker {
  private readonly logger = new Logger(MessagingOutboxWorker.name);
  private processing = false;

  constructor(
    @InjectRepository(StaysMessagingOutbox)
    private readonly outboxRepo: Repository<StaysMessagingOutbox>,
    private readonly domainEvents: DomainEventsService,
    private readonly snapshotRepair: SnapshotRepairService,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async processOutbox(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      const rows = await this.claimPendingRows(20);
      for (const row of rows) {
        try {
          if (isMessagingInternalEvent(row.event_type)) {
            await this.handleInternalEvent(row.event_type, row.payload as Record<string, unknown>);
          } else {
            await this.domainEvents.publish(
              row.event_type as Parameters<DomainEventsService['publish']>[0],
              'stays',
              row.payload as Record<string, unknown>,
            );
          }
          await this.outboxRepo.update(row.id, {
            status: 'DONE',
            processed_at: new Date(),
          });
        } catch (err) {
          const attempts = (row.attempts ?? 0) + 1;
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

  private async handleInternalEvent(
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (eventType === MESSAGING_INTERNAL_EVENTS.SNAPSHOT_REPAIR_REQUESTED) {
      const conversationId = payload.conversationId;
      if (typeof conversationId !== 'string' || !conversationId) {
        throw new Error('snapshot repair missing conversationId');
      }
      await this.snapshotRepair.repairConversation(conversationId);
      return;
    }
    throw new Error(`Unknown internal messaging event: ${eventType}`);
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
