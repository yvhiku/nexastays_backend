import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppTransaction } from '../../transactions/entities/app-transaction.entity';
import { TransactionFee } from '../../transactions/entities/transaction-fee.entity';
import { User } from '../../users/entities/user.entity';
import { AdminTransactionsQueryDto } from '../dto/admin-transactions.query.dto';
import { AdminAuditService } from './admin-audit.service';
import { MoneyMovementIdempotencyService } from '../../../common/idempotency/money-movement-idempotency.service';
import { MoneyMovementScope } from '../../../common/idempotency/money-movement-scope';
import { appConfig } from '../../../common/config/app.config';
import { LedgerPostingService } from '../../ledger/ledger-posting.service';

interface RequestUser {
  userId?: string;
  email?: string;
}

@Injectable()
export class AdminTransactionsService {
  constructor(
    @InjectRepository(AppTransaction)
    private readonly transactionsRepository: Repository<AppTransaction>,
    private readonly auditService: AdminAuditService,
    private readonly dataSource: DataSource,
    private readonly moneyMovementIdempotency: MoneyMovementIdempotencyService,
    private readonly ledgerPostingService: LedgerPostingService,
  ) {}

  async getTransactions(query: AdminTransactionsQueryDto) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 50, 200);

    const qb = this.transactionsRepository
      .createQueryBuilder('t')
      .leftJoin(User, 'sender', 'sender.id = t.sender_user_id')
      .leftJoin(User, 'receiver', 'receiver.id = t.receiver_user_id')
      .leftJoin(TransactionFee, 'fee', 'fee.app_transaction_id = t.id')
      .select([
        't.id as id',
        't.reference as reference',
        't.type as type',
        't.amount as amount',
        't.status as status',
        't.created_at as created_at',
        't.sender_user_id as sender_user_id',
        't.receiver_user_id as receiver_user_id',
        't.idempotency_key as idempotency_key',
        't.failure_reason as failure_reason',
        'sender.phone_number as sender_phone',
        'receiver.phone_number as receiver_phone',
        'fee.amount as fee',
      ])
      .orderBy('t.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status && query.status !== 'all') {
      qb.andWhere('t.status = :status', { status: query.status });
    }

    if (query.type && query.type !== 'all') {
      qb.andWhere('t.type = :type', { type: query.type });
    }

    if (query.search) {
      qb.andWhere(
        '(t.reference ILIKE :search OR t.idempotency_key ILIKE :search OR sender.phone_number ILIKE :search OR receiver.phone_number ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.userId) {
      qb.andWhere(
        '(t.sender_user_id = :userId OR t.receiver_user_id = :userId)',
        { userId: query.userId },
      );
    }

    const rows = await qb.getRawMany();
    return rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      type: row.type,
      amount: Number(row.amount || 0),
      fee: Number(row.fee || 0),
      sender_user_id: row.sender_user_id,
      sender_phone: row.sender_phone,
      receiver_user_id: row.receiver_user_id,
      receiver_phone: row.receiver_phone,
      status: row.status,
      failure_reason: row.failure_reason,
      created_at: row.created_at,
      idempotency_key: row.idempotency_key,
    }));
  }

  async getTransaction(id: string) {
    const qb = this.transactionsRepository
      .createQueryBuilder('t')
      .leftJoin(User, 'sender', 'sender.id = t.sender_user_id')
      .leftJoin(User, 'receiver', 'receiver.id = t.receiver_user_id')
      .leftJoin(TransactionFee, 'fee', 'fee.app_transaction_id = t.id')
      .select([
        't.id as id',
        't.reference as reference',
        't.type as type',
        't.amount as amount',
        't.status as status',
        't.created_at as created_at',
        't.sender_user_id as sender_user_id',
        't.receiver_user_id as receiver_user_id',
        't.idempotency_key as idempotency_key',
        't.failure_reason as failure_reason',
        'sender.phone_number as sender_phone',
        'sender.full_name as sender_name',
        'receiver.phone_number as receiver_phone',
        'receiver.full_name as receiver_name',
        'fee.amount as fee',
      ])
      .where('t.id = :id', { id });

    const row = await qb.getRawOne();
    if (!row) {
      throw new NotFoundException('Transaction not found');
    }
    return {
      id: row.id,
      reference: row.reference,
      type: row.type,
      amount: Number(row.amount || 0),
      fee: Number(row.fee || 0),
      sender_user_id: row.sender_user_id,
      sender_phone: row.sender_phone,
      sender_name: row.sender_name,
      receiver_user_id: row.receiver_user_id,
      receiver_phone: row.receiver_phone,
      receiver_name: row.receiver_name,
      status: row.status,
      failure_reason: row.failure_reason,
      created_at: row.created_at,
      idempotency_key: row.idempotency_key,
    };
  }

  async reverseTransaction(
    id: string,
    reason: string,
    adminUser: RequestUser | undefined,
    idempotencyKey: string,
  ) {
    const adminId = adminUser?.userId;
    if (!adminId) {
      throw new BadRequestException({
        code: 'ADMIN_CONTEXT_REQUIRED',
        message: 'Authenticated admin user id required for reversal idempotency.',
      });
    }

    return this.moneyMovementIdempotency.runInTransaction(
      this.dataSource,
      {
        scope: MoneyMovementScope.ADMIN_TRANSACTION_REVERSAL,
        actorUserId: adminId,
        idempotencyKey,
        requestPayload: { original_transaction_id: id, reason },
      },
      async (manager) => {
        const transaction = await manager.getRepository(AppTransaction).findOne({
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!transaction) {
          throw new NotFoundException('Transaction not found');
        }

        if (transaction.status === 'REVERSED') {
          return { success: true };
        }

        const hasLedger = Boolean(transaction.ledger_transaction_id);

        if (
          !hasLedger &&
          appConfig.env === 'production' &&
          process.env.ALLOW_STATUS_ONLY_ADMIN_REVERSAL !== 'true'
        ) {
          throw new ForbiddenException({
            code: 'REVERSAL_REQUIRES_LEDGER_OR_BREAK_GLASS',
            message:
              'This transaction has no linked ledger journal. Status-only reversal is disabled in production. Set ALLOW_STATUS_ONLY_ADMIN_REVERSAL=true only for controlled break-glass, or backfill ledger_transaction_id.',
          });
        }

        if (transaction.status !== 'COMPLETED') {
          throw new BadRequestException({
            code: 'TRANSACTION_NOT_REVERSIBLE',
            message: 'Only completed transactions can be reversed',
          });
        }

        if (hasLedger && transaction.ledger_transaction_id) {
          const reversalKey = `lr:${crypto
            .createHash('sha256')
            .update(
              `admin_rev:${transaction.ledger_transaction_id}:${idempotencyKey}`,
            )
            .digest('hex')}`;
          const refBase = `REV-${transaction.id}`;
          await this.ledgerPostingService.postMirrorReversal(manager, {
            originalLedgerTransactionId: transaction.ledger_transaction_id,
            idempotencyKey: reversalKey,
            reference: refBase.slice(0, 64),
            description: reason,
            metadata: {
              app_transaction_id: transaction.id,
              admin_user_id: adminId,
              reason,
            },
          });
        }

        transaction.status = 'REVERSED';
        transaction.failure_reason = reason;
        await manager.getRepository(AppTransaction).save(transaction);

        await this.auditService.logAction({
          action: 'TRANSACTION_REVERSED',
          entityType: 'transaction',
          entityId: transaction.id,
          userId: transaction.sender_user_id ?? undefined,
          metadata: { reason, ledger_linked: hasLedger },
          adminUser,
        });

        return { success: true };
      },
    );
  }

  async exportTransactions(query: AdminTransactionsQueryDto) {
    const transactions = await this.getTransactions({
      ...query,
      page: 1,
      limit: 1000,
    });
    const headers = [
      'id',
      'reference',
      'type',
      'amount',
      'fee',
      'sender_phone',
      'receiver_phone',
      'status',
      'created_at',
      'failure_reason',
      'idempotency_key',
    ];

    const rows = transactions.map((tx) => [
      tx.id,
      tx.reference,
      tx.type,
      tx.amount,
      tx.fee,
      tx.sender_phone || '',
      tx.receiver_phone || '',
      tx.status,
      tx.created_at,
      tx.failure_reason || '',
      tx.idempotency_key || '',
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
