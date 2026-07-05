import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { LedgerAccount } from './entities/ledger-account.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { LedgerTransaction } from './entities/ledger-transaction.entity';
import {
  CUSTOMER_LIABILITY_ACCOUNT_TYPE,
  LedgerNormalBalance,
  LedgerSystemAccountType,
} from './ledger-chart.constants';
import { signedBalanceFromPostingConvention } from './ledger-validation';

@Injectable()
export class LedgerService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(LedgerAccount)
    private readonly accountRepository: Repository<LedgerAccount>,
    @InjectRepository(LedgerEntry)
    private readonly entryRepository: Repository<LedgerEntry>,
    @InjectRepository(LedgerTransaction)
    private readonly transactionRepository: Repository<LedgerTransaction>,
  ) {}

  async getOrCreateWalletAccount(
    walletId: string,
    manager?: EntityManager,
  ): Promise<LedgerAccount> {
    const repo =
      manager?.getRepository(LedgerAccount) ?? this.accountRepository;
    const existing = await repo.findOne({
      where: { wallet_id: walletId, account_type: CUSTOMER_LIABILITY_ACCOUNT_TYPE },
    });
    /** Legacy WALLET naming pre-migration */
    const legacy = existing
      ? null
      : await repo.findOne({
          where: { wallet_id: walletId },
        });

    const pick = existing ?? legacy;

    if (pick) {
      if (legacy && legacy.account_type === 'WALLET') {
        await repo.update(pick.id, {
          account_type: CUSTOMER_LIABILITY_ACCOUNT_TYPE,
          normal_balance: LedgerNormalBalance.CREDIT,
          allow_negative: false,
          currency: 'MAD',
        });
        return repo.findOneOrFail({ where: { id: pick.id } });
      }
      return pick;
    }

    return repo.save({
      wallet_id: walletId,
      account_type: CUSTOMER_LIABILITY_ACCOUNT_TYPE,
      system_account: false,
      normal_balance: LedgerNormalBalance.CREDIT,
      allow_negative: false,
      currency: 'MAD',
    });
  }

  /** System control accounts — never post without LedgerPostingService validation. */
  async getOrCreateSystemAccount(
    manager: EntityManager | undefined,
    accountType: LedgerSystemAccountType | string,
  ): Promise<LedgerAccount> {
    const resolved = this.resolveSystemAccountType(accountType);
    const repo =
      manager?.getRepository(LedgerAccount) ?? this.accountRepository;
    let existing = await repo.findOne({
      where: { system_account: true, account_type: resolved },
    });
    if (!existing) {
      const legacyType = this.legacyAliasForResolved(resolved);
      if (legacyType) {
        existing = await repo.findOne({
          where: { system_account: true, account_type: legacyType },
        });
        if (existing) {
          const defaults = this.systemAccountDefaults(resolved);
          await repo.update(existing.id, {
            account_type: resolved,
            normal_balance: defaults.normal_balance,
            allow_negative: defaults.allow_negative,
            currency: 'MAD',
          });
          return repo.findOneOrFail({ where: { id: existing.id } });
        }
      }
    } else {
      return existing;
    }
    const defaults = this.systemAccountDefaults(resolved);
    return repo.save({
      wallet_id: null,
      account_type: resolved,
      system_account: true,
      normal_balance: defaults.normal_balance,
      allow_negative: defaults.allow_negative,
      currency: 'MAD',
    });
  }

  private legacyAliasForResolved(
    resolved: LedgerSystemAccountType,
  ): string | null {
    const m: Partial<Record<LedgerSystemAccountType, string>> = {
      [LedgerSystemAccountType.SAFEGUARDING_MIRROR]: 'SYSTEM_MAIN',
      [LedgerSystemAccountType.FEES]: 'SYSTEM_FEES',
      [LedgerSystemAccountType.COMPANY_REVENUE]: 'SYSTEM_COMPANY_REVENUE',
      [LedgerSystemAccountType.REVERSALS]: 'SYSTEM_REVERSALS',
    };
    return m[resolved] ?? null;
  }

  private resolveSystemAccountType(input: string): LedgerSystemAccountType {
    if (
      input === 'SYSTEM_MAIN' ||
      input === 'SYSTEM_FEES' ||
      input === 'SYSTEM_COMPANY_REVENUE' ||
      input === 'SYSTEM_REVERSALS'
    ) {
      const map: Record<string, LedgerSystemAccountType> = {
        SYSTEM_MAIN: LedgerSystemAccountType.SAFEGUARDING_MIRROR,
        SYSTEM_FEES: LedgerSystemAccountType.FEES,
        SYSTEM_COMPANY_REVENUE: LedgerSystemAccountType.COMPANY_REVENUE,
        SYSTEM_REVERSALS: LedgerSystemAccountType.REVERSALS,
      };
      return map[input]!;
    }
    if (
      (Object.values(LedgerSystemAccountType) as string[]).includes(input)
    ) {
      return input as LedgerSystemAccountType;
    }
    throw new BadRequestException(`Unknown system ledger account: ${input}`);
  }

  private systemAccountDefaults(type: LedgerSystemAccountType): {
    normal_balance: LedgerNormalBalance;
    allow_negative: boolean;
  } {
    switch (type) {
      case LedgerSystemAccountType.SAFEGUARDING_MIRROR:
        return {
          normal_balance: LedgerNormalBalance.DEBIT,
          allow_negative: false,
        };
      case LedgerSystemAccountType.FEES:
      case LedgerSystemAccountType.COMPANY_REVENUE:
        return { normal_balance: LedgerNormalBalance.CREDIT, allow_negative: false };
      case LedgerSystemAccountType.REWARDS_LIABILITY:
        return {
          normal_balance: LedgerNormalBalance.CREDIT,
          allow_negative: false,
        };
      case LedgerSystemAccountType.SUSPENSE:
      case LedgerSystemAccountType.REVERSALS:
        return { normal_balance: LedgerNormalBalance.CREDIT, allow_negative: true };
      default:
        return {
          normal_balance: LedgerNormalBalance.CREDIT,
          allow_negative: false,
        };
    }
  }

  async getSystemAccounts(manager?: EntityManager): Promise<LedgerAccount[]> {
    const repo =
      manager?.getRepository(LedgerAccount) ?? this.accountRepository;
    return repo.find({
      where: { system_account: true },
      order: { account_type: 'ASC' },
    });
  }

  async ensureSystemAccounts(manager?: EntityManager): Promise<void> {
    const types = Object.values(LedgerSystemAccountType);
    for (const t of types) {
      await this.getOrCreateSystemAccount(manager, t);
    }
  }

  /**
   * Signed balance in MAD (positive = normal direction for that account's normal_balance).
   */
  async getSignedBalance(
    account: LedgerAccount,
    manager?: EntityManager,
  ): Promise<number> {
    const repo = manager?.getRepository(LedgerEntry) ?? this.entryRepository;
    const row = await repo
      .createQueryBuilder('le')
      .select(
        "COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0)",
        'c',
      )
      .addSelect(
        "COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0)",
        'd',
      )
      .where('le.account_id = :accountId', { accountId: account.id })
      .getRawOne();
    const c = Number(row?.c ?? 0);
    const d = Number(row?.d ?? 0);
    return signedBalanceFromPostingConvention(
      account.normal_balance,
      c - d,
      d - c,
    );
  }

  /** Backwards-compatible alias — always reads from ledger entries. */
  async getBalance(accountId: string, manager?: EntityManager): Promise<number> {
    const repo =
      manager?.getRepository(LedgerAccount) ?? this.accountRepository;
    const account = await repo.findOne({ where: { id: accountId } });
    if (!account) {
      throw new NotFoundException('Ledger account not found');
    }
    return this.getSignedBalance(account, manager);
  }

  async runInLedgerTransaction<T>(
    handler: (manager: EntityManager) => Promise<T>,
  ) {
    return this.dataSource.transaction(async (manager) => handler(manager));
  }
}
