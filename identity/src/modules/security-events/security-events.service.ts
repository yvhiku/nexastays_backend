import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SecurityEvent,
  type SecurityEventType,
} from './entities/security-event.entity';
import { QuerySecurityEventsDto } from './dto/query-security-events.dto';

export interface CreateSecurityEventInput {
  user_id?: string | null;
  event_type: SecurityEventType;
  metadata?: Record<string, unknown> | null;
  ip_address?: string | null;
  device_id?: string | null;
}

@Injectable()
export class SecurityEventsService {
  constructor(
    @InjectRepository(SecurityEvent)
    private readonly securityEventRepository: Repository<SecurityEvent>,
  ) {}

  /**
   * High-volume path uses insert() (no entity hydration, no SELECT roundtrip).
   */
  async logEvent(input: CreateSecurityEventInput): Promise<void> {
    await this.securityEventRepository.insert(
      {
        user_id: input.user_id ?? null,
        event_type: input.event_type,
        metadata: input.metadata ?? null,
        ip_address: input.ip_address ?? null,
        device_id: input.device_id ?? null,
      } as any,
    );
  }

  async queryEvents(query: QuerySecurityEventsDto) {
    const limit = Math.min(query.limit ?? 100, 1000);
    const qb = this.securityEventRepository
      .createQueryBuilder('e')
      .orderBy('e.created_at', 'DESC')
      .take(limit);

    if (query.user_id) {
      qb.andWhere('e.user_id = :userId', { userId: query.user_id });
    }
    if (query.event_type) {
      qb.andWhere('e.event_type = :eventType', { eventType: query.event_type });
    }

    const rows = await qb.getMany();
    return rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      event_type: row.event_type,
      metadata: row.metadata,
      ip: row.ip_address,
      deviceId: row.device_id,
      timestamp: row.created_at,
    }));
  }
}
