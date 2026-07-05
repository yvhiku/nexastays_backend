import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../audit/entities/audit-log.entity';
import { AdminAuditQueryDto } from '../dto/admin-audit.query.dto';

interface AuditUser {
  userId?: string;
  email?: string;
}

@Injectable()
export class AdminAuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
  ) {}

  async logAction(params: {
    action: string;
    entityType?: string;
    entityId?: string;
    userId?: string;
    metadata?: Record<string, any>;
    adminUser?: AuditUser;
    ipAddress?: string;
    deviceId?: string;
  }) {
    const log = this.auditRepository.create({
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      user_id: params.userId,
      admin_user_id: params.adminUser?.userId,
      admin_email: params.adminUser?.email,
      ip_address: params.ipAddress,
      device_id: params.deviceId,
      metadata: params.metadata || {},
    });
    return this.auditRepository.save(log);
  }

  async getLogs(query: AdminAuditQueryDto) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 50, 200);

    const qb = this.auditRepository.createQueryBuilder('log');

    if (query.action && query.action !== 'all') {
      qb.andWhere('log.action = :action', { action: query.action });
    }

    if (query.search) {
      qb.andWhere(
        '(log.action ILIKE :search OR log.admin_email ILIKE :search OR log.entity_id ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.user_id) {
      qb.andWhere('log.user_id = :userId', { userId: query.user_id });
    }

    qb.orderBy('log.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    return qb.getMany();
  }

  async exportLogs(query: AdminAuditQueryDto) {
    const logs = await this.getLogs({ ...query, page: 1, limit: 1000 });
    const headers = [
      'id',
      'action',
      'entity_type',
      'entity_id',
      'admin_email',
      'user_id',
      'ip_address',
      'device_id',
      'created_at',
      'metadata',
    ];

    const rows = logs.map((log) => [
      log.id,
      log.action,
      log.entity_type || '',
      log.entity_id || '',
      log.admin_email || '',
      log.user_id || '',
      log.ip_address || '',
      log.device_id || '',
      log.created_at?.toISOString?.() || '',
      JSON.stringify(log.metadata || {}),
    ]);

    return [
      headers.join(','),
      ...rows.map((row) => row.map((value) => this.escapeCsv(value)).join(',')),
    ].join('\n');
  }

  private escapeCsv(value: unknown) {
    if (value == null) {
      return '';
    }
    const stringValue = String(value);
    if (
      stringValue.includes(',') ||
      stringValue.includes('"') ||
      stringValue.includes('\n')
    ) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  }
}
