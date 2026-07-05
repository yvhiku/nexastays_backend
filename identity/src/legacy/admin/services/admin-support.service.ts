import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportTicket } from '../entities/support-ticket.entity';
import { RefundRequest } from '../entities/refund-request.entity';
import { User } from '../../users/entities/user.entity';
import { AppTransaction } from '../../transactions/entities/app-transaction.entity';
import {
  AdminSupportTicketsQueryDto,
  AdminSupportRefundsQueryDto,
} from '../dto/admin-support-query.dto';

@Injectable()
export class AdminSupportService {
  constructor(
    @InjectRepository(SupportTicket)
    private readonly ticketRepo: Repository<SupportTicket>,
    @InjectRepository(RefundRequest)
    private readonly refundRepo: Repository<RefundRequest>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AppTransaction)
    private readonly appTxRepo: Repository<AppTransaction>,
  ) {}

  async getTickets(query: AdminSupportTicketsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const qb = this.ticketRepo
      .createQueryBuilder('t')
      .leftJoin(User, 'u', 'u.id = t.user_id')
      .select([
        't.id as id',
        't.user_id as user_id',
        't.category as category',
        't.subject as subject',
        't.status as status',
        't.priority as priority',
        't.created_at as created_at',
        't.updated_at as updated_at',
        'u.full_name as user_name',
        'u.phone_number as user_phone',
      ])
      .orderBy('t.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      user_name: r.user_name ?? null,
      user_phone: r.user_phone ?? null,
      category: r.category,
      subject: r.subject ?? 'N/A',
      status: r.status,
      priority: r.priority ?? 'LOW',
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  }

  async getTicket(id: string) {
    const t = await this.ticketRepo.findOne({
      where: { id },
      select: [
        'id',
        'user_id',
        'category',
        'subject',
        'status',
        'priority',
        'created_at',
        'updated_at',
      ],
    });
    if (!t) {
      throw new NotFoundException('Ticket not found');
    }
    const u = await this.userRepo.findOne({
      where: { id: t.user_id },
      select: ['full_name', 'phone_number'],
    });
    return {
      ...t,
      user_name: u?.full_name ?? null,
      user_phone: u?.phone_number ?? null,
    };
  }

  async getRefunds(query: AdminSupportRefundsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const qb = this.refundRepo
      .createQueryBuilder('r')
      .leftJoin(User, 'u', 'u.id = r.user_id')
      .select([
        'r.id as id',
        'r.original_transaction_id as transaction_id',
        'r.user_id as user_id',
        'r.amount as amount',
        'r.reason as reason',
        'r.status as status',
        'r.created_at as created_at',
        'u.full_name as user_name',
        'u.phone_number as user_phone',
      ])
      .orderBy('r.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      id: r.id,
      refund_id: r.id,
      original_transaction_id: r.transaction_id,
      transaction_id: r.transaction_id,
      user_id: r.user_id,
      user_name: r.user_name ?? null,
      user_phone: r.user_phone ?? null,
      amount: Number(r.amount ?? 0),
      reason: r.reason ?? 'N/A',
      status: r.status,
      created_at: r.created_at,
    }));
  }

  async getRefund(id: string) {
    const r = await this.refundRepo.findOne({ where: { id } });
    if (!r) {
      throw new NotFoundException('Refund not found');
    }
    const u = r.user_id
      ? await this.userRepo.findOne({
          where: { id: r.user_id },
          select: ['full_name', 'phone_number'],
        })
      : null;
    return {
      ...r,
      refund_id: r.id,
      original_transaction_id: r.original_transaction_id,
      transaction_id: r.original_transaction_id,
      user_name: u?.full_name ?? null,
      user_phone: u?.phone_number ?? null,
      amount: Number(r.amount),
    };
  }
}
