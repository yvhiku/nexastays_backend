import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import { AuditLog } from './entities/audit-log.entity';
import { SecurityEventsService } from '../security-events/security-events.service';
import type { SecurityEventType } from '../security-events/entities/security-event.entity';

export interface AuditParams {
  actorUserId?: string | null;
  actorRole?: string | null;
  actorEmail?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  req?: Request | null;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
    private readonly securityEventsService: SecurityEventsService,
  ) {}

  /**
   * Write an audit log. Never include secrets (OTP, PIN, JWT, document numbers) in metadata.
   */
  async audit(params: AuditParams): Promise<AuditLog> {
    const ip =
      params.req?.ip ||
      (params.req?.connection as { remoteAddress?: string } | undefined)
        ?.remoteAddress ||
      (params.req?.headers?.['x-forwarded-for'] as string)
        ?.split(',')[0]
        ?.trim() ||
      null;
    const userAgent = params.req?.headers?.['user-agent']
      ? String(params.req.headers['user-agent']).slice(0, 100)
      : null;
    const log = this.auditRepository.create({
      action: params.action,
      entity_type: params.targetType,
      entity_id: params.targetId ?? undefined,
      user_id: params.actorUserId ?? undefined,
      admin_user_id: params.actorUserId ?? undefined,
      admin_email: params.actorEmail ?? undefined,
      ip_address: ip ?? undefined,
      device_id: userAgent ?? undefined,
      metadata: (params.metadata ?? {}) as Record<string, any>,
    } as Partial<AuditLog>);
    const saved = await this.auditRepository.save(log);
    await this.logSecurityEventFromAudit(params, ip, userAgent).catch(() => {});
    return saved;
  }

  private mapAuditActionToSecurityEvent(
    action: string,
  ): SecurityEventType | undefined {
    if (action === 'PIN_VERIFY_FAILED') return 'AUTH_FAILURE';
    if (action === 'PIN_LOCKOUT') return 'PIN_LOCKOUT';
    if (
      action === 'NEW_DEVICE_VERIFICATION_REQUIRED' ||
      action === 'STEP_UP_OTP_REQUIRED' ||
      action === 'STEP_UP_BLOCKED_MANUAL_REVIEW' ||
      action === 'STEP_UP_TRANSFER_OTP_REQUIRED' ||
      action === 'STEP_UP_TRANSFER_BLOCKED_MANUAL_REVIEW'
    ) {
      return 'DEVICE_ANOMALY';
    }
    if (
      action === 'CONSENT_MANDATORY_ACCEPTED' ||
      action === 'CONSENT_MARKETING_UPDATED'
    ) {
      return 'CONSENT_UPDATED';
    }
    if (action === 'DATA_EXPORT_REQUESTED') return 'DATA_EXPORT_REQUESTED';
    if (action === 'ACCOUNT_DELETION_REQUESTED')
      return 'ACCOUNT_DELETION_REQUESTED';
    if (action === 'SAR_CREATED') return 'SAR_CREATED';
    return undefined;
  }

  private async logSecurityEventFromAudit(
    params: AuditParams,
    ip: string | null,
    userAgent: string | null,
  ): Promise<void> {
    const eventType = this.mapAuditActionToSecurityEvent(params.action);
    if (!eventType) return;
    await this.securityEventsService.logEvent({
      user_id: params.actorUserId ?? params.targetId ?? null,
      event_type: eventType,
      metadata: {
        source_action: params.action,
        target_type: params.targetType,
        target_id: params.targetId ?? null,
        ...(params.metadata ?? {}),
      },
      ip_address: ip,
      device_id:
        (params.req?.headers?.['x-device-id'] as string | undefined) ??
        userAgent ??
        null,
    });
  }
}
