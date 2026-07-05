import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaysAuditLog } from '../entities/stays-audit-log.entity';

export interface AuditParams {
  actorUserId?: string | null;
  actorRole?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class StaysAuditService {
  constructor(
    @InjectRepository(StaysAuditLog)
    private readonly auditRepo: Repository<StaysAuditLog>,
  ) {}

  async log(params: AuditParams): Promise<void> {
    const log = this.auditRepo.create({
      actor_user_id: params.actorUserId ?? null,
      actor_role: params.actorRole ?? null,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      action: params.action,
      metadata: params.metadata ?? {},
      ip: params.ip ?? null,
      user_agent: params.userAgent ?? null,
    });
    await this.auditRepo.save(log).catch(() => {});
  }
}
