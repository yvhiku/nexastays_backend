import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaysSupportCannedReply } from './entities/stays-support-canned-reply.entity';
import { StaysAuditService } from '../stays/services/stays-audit.service';

@Injectable()
export class SupportCannedRepliesService {
  constructor(
    @InjectRepository(StaysSupportCannedReply)
    private readonly repo: Repository<StaysSupportCannedReply>,
    private readonly staysAudit: StaysAuditService,
  ) {}

  private toRow(row: StaysSupportCannedReply) {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      category: row.category,
      created_by_admin_id: row.created_by_admin_id,
      updated_by_admin_id: row.updated_by_admin_id,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
      is_active: row.is_active,
    };
  }

  async list(includeInactive = false) {
    const qb = this.repo
      .createQueryBuilder('c')
      .orderBy('c.updated_at', 'DESC');
    if (!includeInactive) {
      qb.where('c.is_active = true');
    }
    const rows = await qb.getMany();
    return { items: rows.map((r) => this.toRow(r)) };
  }

  async create(
    adminId: string,
    input: { title: string; body: string; category?: string | null },
  ) {
    const title = input.title.trim();
    const body = input.body.trim();
    if (!title || title.length > 120) {
      throw new BadRequestException('Invalid title');
    }
    if (!body || body.length > 5000) {
      throw new BadRequestException('Invalid body');
    }
    const category = input.category?.trim() || null;
    const saved = await this.repo.save(
      this.repo.create({
        title,
        body,
        category,
        created_by_admin_id: adminId,
        updated_by_admin_id: adminId,
        is_active: true,
      }),
    );
    await this.staysAudit.log({
      actorUserId: adminId,
      actorRole: 'ADMIN',
      entityType: 'support_canned_reply',
      entityId: saved.id,
      action: 'support_canned_reply_created',
      metadata: { replyId: saved.id, title: saved.title },
    });
    return this.toRow(saved);
  }

  async patch(
    id: string,
    adminId: string,
    patch: {
      title?: string;
      body?: string;
      category?: string | null;
      is_active?: boolean;
    },
  ) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Canned reply not found');
    if (patch.title !== undefined) {
      const title = patch.title.trim();
      if (!title || title.length > 120) {
        throw new BadRequestException('Invalid title');
      }
      row.title = title;
    }
    if (patch.body !== undefined) {
      const body = patch.body.trim();
      if (!body || body.length > 5000) {
        throw new BadRequestException('Invalid body');
      }
      row.body = body;
    }
    if (patch.category !== undefined) {
      row.category = patch.category?.trim() || null;
    }
    if (patch.is_active !== undefined) {
      row.is_active = patch.is_active;
    }
    row.updated_by_admin_id = adminId;
    row.updated_at = new Date();
    const saved = await this.repo.save(row);
    await this.staysAudit.log({
      actorUserId: adminId,
      actorRole: 'ADMIN',
      entityType: 'support_canned_reply',
      entityId: saved.id,
      action: 'support_canned_reply_updated',
      metadata: { replyId: saved.id, title: saved.title },
    });
    return this.toRow(saved);
  }

  async deactivate(id: string, adminId: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Canned reply not found');
    if (!row.is_active) return this.toRow(row);
    row.is_active = false;
    row.updated_by_admin_id = adminId;
    row.updated_at = new Date();
    const saved = await this.repo.save(row);
    await this.staysAudit.log({
      actorUserId: adminId,
      actorRole: 'ADMIN',
      entityType: 'support_canned_reply',
      entityId: saved.id,
      action: 'support_canned_reply_deactivated',
      metadata: { replyId: saved.id, title: saved.title },
    });
    return this.toRow(saved);
  }
}
