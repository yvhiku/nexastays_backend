import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { Repository } from 'typeorm';
import { LedgerTransaction } from './entities/ledger-transaction.entity';
import { LedgerEntry, EntryType } from './entities/ledger-entry.entity';
import { LedgerAccount } from './entities/ledger-account.entity';
import { LedgerService } from './ledger.service';
import {
  assertBalancedJournal,
  computeStableJournalPayloadHash,
  type JournalLineInput,
} from './ledger-validation';

export interface PostJournalParams {
  /** Durable replay key; repeats return the existing ledger transaction unchanged. */
  readonly idempotencyKey?: string;
  readonly reference: string;
  readonly description?: string;
  /** Optional compensating linkage for audit trails. */
  readonly reversesLedgerTransactionId?: string;
  readonly metadata?: Record<string, unknown> | null;
  readonly lines: JournalLineInput[];
}

const BALANCE_EPSILON = 0.009;

/** Sole Nest-layer writer for `ledger_entries`; route all monetary journals here. */
@Injectable()
export class LedgerPostingService {
  constructor(
    private readonly ledgerService: LedgerService,
    @InjectRepository(LedgerTransaction)
    private readonly ledgerTxnRepository: Repository<LedgerTransaction>,
  ) {}

  async findByIdempotencyKey(
    idempotencyKey: string,
    manager?: EntityManager,
  ): Promise<LedgerTransaction | null> {
    const repo =
      manager?.getRepository(LedgerTransaction) ?? this.ledgerTxnRepository;
    return repo.findOne({ where: { idempotency_key: idempotencyKey } });
  }

  /**
   * Atomically creates a ledger_transaction row and all entries.
   * Validates double-entry, then enforces allow_negative per touched account.
   */
  async postJournal(
    manager: EntityManager,
    params: PostJournalParams,
  ): Promise<LedgerTransaction> {
    const payloadHash =
      params.idempotencyKey != null
        ? computeStableJournalPayloadHash(params.lines)
        : null;

    if (params.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(
        params.idempotencyKey,
        manager,
      );
      if (existing) {
        if (
          existing.idempotency_payload_hash &&
          payloadHash &&
          existing.idempotency_payload_hash !== payloadHash
        ) {
          throw new ConflictException({
            code: 'LEDGER_IDEMPOTENCY_PAYLOAD_MISMATCH',
            message:
              'This idempotency key was already posted with different journal lines',
          });
        }
        return existing;
      }
    }

    assertBalancedJournal(params.lines);

    const ref = params.reference.slice(0, 64);
    const txnRepo = manager.getRepository(LedgerTransaction);
    const entryRepo = manager.getRepository(LedgerEntry);
    const accountRepo = manager.getRepository(LedgerAccount);

    const ledgerTxn = await txnRepo.save({
      reference: ref,
      description: params.description ?? null,
      idempotency_key: params.idempotencyKey ?? null,
      idempotency_payload_hash: payloadHash,
      metadata: params.metadata ?? null,
      reverses_ledger_transaction_id: params.reversesLedgerTransactionId ?? null,
    });

    const rows = params.lines.map((line, idx) => ({
      transaction_id: ledgerTxn.id,
      account_id: line.accountId,
      amount: line.amount,
      entry_type: line.entryType as EntryType,
      line_number: idx + 1,
    }));
    await entryRepo.save(rows);

    const touched = [...new Set(params.lines.map((l) => l.accountId))];
    for (const accountId of touched) {
      const account = await accountRepo.findOne({ where: { id: accountId } });
      if (!account) {
        throw new NotFoundException(`Ledger account ${accountId} not found`);
      }
      if (!account.allow_negative) {
        const bal = await this.ledgerService.getSignedBalance(account, manager);
        if (bal < -BALANCE_EPSILON) {
          throw new BadRequestException({
            code: 'LEDGER_NEGATIVE_BALANCE',
            message: `Posting would leave account ${accountId} (${account.account_type}) negative`,
            balance: bal,
          });
        }
      }
    }

    return ledgerTxn;
  }

  /**
   * Mirror-post all lines of an original journal (swap debit/credit per line).
   * Idempotent: one reversal per original transaction; replays return the same row.
   */
  async postMirrorReversal(
    manager: EntityManager,
    params: {
      readonly originalLedgerTransactionId: string;
      readonly idempotencyKey: string;
      readonly reference: string;
      readonly description?: string;
      readonly metadata?: Record<string, unknown> | null;
    },
  ): Promise<LedgerTransaction> {
    const txnRepo = manager.getRepository(LedgerTransaction);

    const prior = await txnRepo.findOne({
      where: {
        reverses_ledger_transaction_id: params.originalLedgerTransactionId,
      },
    });
    if (prior) {
      return prior;
    }

    if (params.idempotencyKey) {
      const byKey = await this.findByIdempotencyKey(
        params.idempotencyKey,
        manager,
      );
      if (byKey) {
        return byKey;
      }
    }

    const orig = await txnRepo.findOne({
      where: { id: params.originalLedgerTransactionId },
      relations: ['entries'],
    });
    if (!orig?.entries?.length) {
      throw new NotFoundException(
        `Ledger transaction ${params.originalLedgerTransactionId} not found or has no lines`,
      );
    }

    const sorted = [...orig.entries].sort(
      (a, b) => (a.line_number ?? 0) - (b.line_number ?? 0),
    );
    const lines: JournalLineInput[] = sorted.map((e) => ({
      accountId: e.account_id,
      amount: Number(e.amount),
      entryType: e.entry_type === EntryType.DEBIT ? 'CREDIT' : 'DEBIT',
    }));

    return this.postJournal(manager, {
      idempotencyKey: params.idempotencyKey,
      reference: params.reference,
      description: params.description,
      metadata: params.metadata ?? null,
      reversesLedgerTransactionId: params.originalLedgerTransactionId,
      lines,
    });
  }

  /**
   * Helpers for common 2-line movements (still creates a single balanced journal).
   */
  async postTwoLegJournal(
    manager: EntityManager,
    params: Omit<PostJournalParams, 'lines'> & {
      debitAccountId: string;
      creditAccountId: string;
      amount: number;
    },
  ): Promise<LedgerTransaction> {
    if (!(params.amount > 0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }
    return this.postJournal(manager, {
      ...params,
      lines: [
        {
          accountId: params.debitAccountId,
          entryType: EntryType.DEBIT,
          amount: params.amount,
        },
        {
          accountId: params.creditAccountId,
          entryType: EntryType.CREDIT,
          amount: params.amount,
        },
      ],
    });
  }
}
