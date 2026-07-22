import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaysMessagingOutbox } from './entities/stays-messaging-outbox.entity';
import { DomainEventsService } from '../../common/events/domain-events.service';
import { isMessagingInternalEvent, MESSAGING_INTERNAL_EVENTS } from './messaging-internal.events';
import { SnapshotRepairService } from './snapshot-repair.service';
import { EVENTS, EventValidationError } from '@nexa/event-bus';

const MAX_OUTBOX_ATTEMPTS = 5;

function resolveProviderIntentId(
  bookingId: string,
  providerIntentId?: string | null,
  paymentIntentId?: string | null,
): string {
  const candidate = (providerIntentId ?? paymentIntentId ?? '').trim();
  return candidate || `booking-${bookingId}`;
}

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
      await this.recoverStaleProcessingRows();
      const rows = await this.claimPendingRows(20);
      for (const row of rows) {
        if (!row?.id || !row.event_type) {
          this.logger.warn('Skipping outbox row with missing id or event_type');
          continue;
        }
        try {
          const payload = this.normalizePayload(row.event_type, row.payload as Record<string, unknown>);
          if (isMessagingInternalEvent(row.event_type)) {
            await this.handleInternalEvent(row.event_type, payload);
          } else {
            await this.domainEvents.publish(
              row.event_type as Parameters<DomainEventsService['publish']>[0],
              'stays',
              payload,
            );
          }
          await this.outboxRepo.update(row.id, {
            status: 'DONE',
            processed_at: new Date(),
          });
        } catch (err) {
          const attempts = (row.attempts ?? 0) + 1;
          const isValidationError = err instanceof EventValidationError;
          const isPermanentFailure = isValidationError || attempts >= MAX_OUTBOX_ATTEMPTS;
          const delayMs = Math.min(60_000, 1000 * 2 ** attempts);
          this.logger.warn(`Outbox ${row.id} failed attempt ${attempts}: ${err}`);
          await this.outboxRepo.update(row.id, {
            status: isPermanentFailure ? 'FAILED' : 'PENDING',
            attempts,
            next_retry_at: isPermanentFailure ? row.next_retry_at : new Date(Date.now() + delayMs),
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
         WHERE status = 'PENDING'
           AND next_retry_at <= NOW()
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [limit],
    );
    return this.unwrapQueryRows(raw);
  }

  /** TypeORM 0.3 pg driver returns [rows, rowCount] for UPDATE…RETURNING. */
  private unwrapQueryRows(raw: unknown): StaysMessagingOutbox[] {
    if (Array.isArray(raw) && raw.length === 2 && Array.isArray(raw[0])) {
      return raw[0] as StaysMessagingOutbox[];
    }
    if (Array.isArray(raw)) {
      return raw as StaysMessagingOutbox[];
    }
    return [];
  }

  /** Repair legacy rows enqueued before providerIntentId validation was enforced. */
  private normalizePayload(
    eventType: string,
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    if (
      eventType === EVENTS.PAYMENT_SUCCEEDED &&
      typeof payload.bookingId === 'string' &&
      payload.bookingId
    ) {
      const providerIntentId =
        typeof payload.providerIntentId === 'string' ? payload.providerIntentId : undefined;
      return {
        ...payload,
        providerIntentId: resolveProviderIntentId(
          payload.bookingId,
          providerIntentId,
          typeof payload.paymentIntentId === 'string' ? payload.paymentIntentId : undefined,
        ),
      };
    }
    return payload;
  }

  /** Re-queue rows left in PROCESSING after a crash or failed retry update. */
  private async recoverStaleProcessingRows(): Promise<void> {
    await this.outboxRepo.manager.query(
      `UPDATE stays_messaging_outbox
       SET status = 'PENDING', next_retry_at = NOW()
       WHERE status = 'PROCESSING'
         AND processed_at IS NULL
         AND created_at < NOW() - INTERVAL '1 minute'`,
    );
  }
}
