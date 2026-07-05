import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository, Not, IsNull } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Wallet } from '../../wallets/entities/wallet.entity';
import { LedgerEntry } from '../../ledger/entities/ledger-entry.entity';
import { LedgerAccount } from '../../ledger/entities/ledger-account.entity';
import { AppTransaction } from '../../transactions/entities/app-transaction.entity';
import { KycProfile } from '../../compliance/entities/kyc-profile.entity';
import { RiskAlert } from '../entities/risk-alert.entity';

@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletsRepository: Repository<Wallet>,
    @InjectRepository(LedgerEntry)
    private readonly ledgerEntriesRepository: Repository<LedgerEntry>,
    @InjectRepository(LedgerAccount)
    private readonly ledgerAccountsRepository: Repository<LedgerAccount>,
    @InjectRepository(AppTransaction)
    private readonly transactionsRepository: Repository<AppTransaction>,
    @InjectRepository(KycProfile)
    private readonly kycRepository: Repository<KycProfile>,
    @InjectRepository(RiskAlert)
    private readonly riskRepository: Repository<RiskAlert>,
  ) {}

  async getStats() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      totalWallets,
      pendingKyc,
      flaggedTransactions,
      dailyTransactions,
      dailyCompleted,
      failedTransactions,
    ] = await Promise.all([
      this.usersRepository.count(),
      this.walletsRepository.count(),
      this.kycRepository.count({ where: { status: 'PENDING' } }),
      this.riskRepository.count({ where: { status: 'OPEN' } }),
      this.transactionsRepository.count({
        where: { created_at: MoreThanOrEqual(startOfDay) },
      }),
      this.transactionsRepository.count({
        where: { created_at: MoreThanOrEqual(startOfDay), status: 'COMPLETED' },
      }),
      this.transactionsRepository.count({
        where: { created_at: MoreThanOrEqual(startOfDay), status: 'FAILED' },
      }),
    ]);

    const verifiedUsers = await this.kycRepository.count({
      where: { status: 'APPROVED' },
    });

    const activeUsers = await this.usersRepository.count({
      where: { last_login_at: MoreThanOrEqual(startOfDay) },
    });

    const dailyVolumeRow = await this.transactionsRepository
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount), 0)', 'total')
      .where('t.created_at >= :start', { start: startOfDay.toISOString() })
      .andWhere('t.status = :status', { status: 'COMPLETED' })
      .getRawOne();

    // Calculate total wallet balance by summing balances of all wallet accounts
    // First, get all wallet account IDs
    const walletAccounts = await this.ledgerAccountsRepository.find({
      where: {
        wallet_id: Not(IsNull()),
        system_account: false,
      },
      select: ['id'],
    });

    let totalWalletBalance = 0;
    if (walletAccounts.length > 0) {
      const accountIds = walletAccounts.map((acc) => acc.id);
      const totalWalletBalanceRow = await this.ledgerEntriesRepository
        .createQueryBuilder('entry')
        .select(
          "COALESCE(SUM(CASE WHEN entry.entry_type = 'CREDIT' THEN entry.amount ELSE -entry.amount END), 0)",
          'balance',
        )
        .where('entry.account_id IN (:...accountIds)', { accountIds })
        .getRawOne();
      totalWalletBalance = Number(totalWalletBalanceRow?.balance || 0);
    }

    const dailyVolume = Number(dailyVolumeRow?.total || 0);
    const successRate =
      dailyTransactions === 0
        ? 0
        : Number(((dailyCompleted / dailyTransactions) * 100).toFixed(2));

    return {
      totalUsers,
      verifiedUsers,
      pendingKyc,
      totalWalletBalance,
      dailyTransactions,
      failedTransactions,
      activeUsers,
      totalWallets,
      dailyVolume,
      successRate,
      flaggedTransactions,
      systemStatus: {
        api: 'healthy',
        database: 'healthy',
        queue: 'healthy',
      },
    };
  }
}
