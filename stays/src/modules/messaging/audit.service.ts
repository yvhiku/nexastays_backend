import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaysMessagingAuditLog } from './entities/stays-messaging-audit-log.entity';

@Injectable()
export class MessagingAuditService {
  constructor(
    @InjectRepository(StaysMessagingAuditLog)
    private readonly auditRepo: Repository<StaysMessagingAuditLog>,
  ) {}

  async log(
    action: string,
    conversationId: string | null,
    actorUserId: string | null,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.auditRepo.save(
      this.auditRepo.create({
        action,
        conversation_id: conversationId,
        actor_user_id: actorUserId,
        metadata,
      }),
    );
  }
}
