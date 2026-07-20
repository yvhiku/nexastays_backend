import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
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
      const rows = await this.outboxRepo.find({
        where: [
          { status: 'PENDING', next_retry_at: LessThanOrEqual(new Date()) },
          { status: 'FAILED', next_retry_at: LessThanOrEqual(new Date()) },
        ],
        order: { created_at: 'ASC' },
        take: 20,
      });

      for (const row of rows) {
        await this.outboxRepo.update(row.id, { status: 'PROCESSING' });
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
}
