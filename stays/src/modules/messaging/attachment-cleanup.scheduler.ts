import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThan, In } from 'typeorm';
import { StaysMessageAttachment } from './entities/stays-message-attachment.entity';
import { StaysAttachmentSession } from './entities/stays-attachment-session.entity';
import { AttachmentService } from './attachment.service';
import { AttachmentSessionService } from './attachment-session.service';

const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AttachmentCleanupScheduler {
  private readonly logger = new Logger(AttachmentCleanupScheduler.name);

  constructor(
    @InjectRepository(StaysMessageAttachment)
    private readonly attachmentRepo: Repository<StaysMessageAttachment>,
    @InjectRepository(StaysAttachmentSession)
    private readonly sessionRepo: Repository<StaysAttachmentSession>,
    private readonly attachments: AttachmentService,
    private readonly sessions: AttachmentSessionService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupOrphanAttachments(): Promise<void> {
    const cutoff = new Date(Date.now() - ORPHAN_AGE_MS);
    let removed = 0;

    const abandonedSessions = await this.sessions.markExpiredSessionsAbandoned();
    if (abandonedSessions > 0) {
      this.logger.log(`Marked ${abandonedSessions} expired attachment sessions abandoned`);
    }

    const staleSessions = await this.sessionRepo.find({
      where: {
        status: In(['ABANDONED', 'CREATED', 'UPLOADING', 'READY']),
        updated_at: LessThan(cutoff),
      },
    });
    for (const session of staleSessions) {
      if (session.status === 'COMPLETED') continue;
      const items = await this.attachmentRepo.find({
        where: { session_id: session.id, message_id: IsNull() },
      });
      for (const row of items) {
        await this.attachments.deleteUnlinkedAttachment(row);
        removed++;
      }
      await this.sessionRepo.delete(session.id);
    }

    const orphanRows = await this.attachmentRepo.find({
      where: { message_id: IsNull(), session_id: IsNull(), created_at: LessThan(cutoff) },
    });
    for (const row of orphanRows) {
      await this.attachments.deleteUnlinkedAttachment(row);
      removed++;
    }

    if (removed > 0) {
      this.logger.log(`Cleaned up ${removed} orphan messaging attachments`);
    }
  }
}
