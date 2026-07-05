import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { LedgerEntry } from '../ledger/entities/ledger-entry.entity';
import { AppTransaction } from '../transactions/entities/app-transaction.entity';
import { LedgerService } from '../ledger/ledger.service';
import { RpCashbackProgramService } from '../rewards-program/rp-cashback-program.service';
import type { EffectiveTierLimits } from '../compliance/kyc-policy/kyc-policy.types';
import {
  normalizeSubscriptionTier,
  SUBSCRIPTION_TIER_LIMITS,
  mergeSubscriptionWithKycLimits,
  type SubscriptionTierKey,
  type SubscriptionTierLimits,
} from './subscription-limits.constants';
import { normalizeKycStatus } from '../compliance/kyc-policy/kyc-status';

@Injectable()
export class SubscriptionLimitsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(LedgerEntry)
    private readonly ledgerEntryRepo: Repository<LedgerEntry>,
    @InjectRepository(AppTransaction)
    private readonly txRepo: Repository<AppTransaction>,
    private readonly ledgerService: LedgerService,
    private readonly cashbackProgram: RpCashbackProgramService,
  ) {}

  getPolicy(tier: SubscriptionTierKey): SubscriptionTierLimits {
    return SUBSCRIPTION_TIER_LIMITS[tier];
  }

  /** Tighten KYC tier caps for verified users (min per axis). */
  mergeWithKycLimits(
    kycLimits: EffectiveTierLimits,
    subscription: SubscriptionTierLimits,
  ): EffectiveTierLimits {
    const merged = mergeSubscriptionWithKycLimits(kycLimits, subscription);
    return { ...kycLimits, ...merged };
  }

  async assertQrDailyLimit(params: {
    manager: EntityManager;
    userId: string;
    amountMad: number;
    rewardsTier: string | null | undefined;
  }): Promise<void> {
    const tier = normalizeSubscriptionTier(params.rewardsTier);
    const cap = SUBSCRIPTION_TIER_LIMITS[tier].qrPaymentsDailyMad;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const row = await params.manager
      .getRepository(AppTransaction)
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount), 0)', 'total')
      .where('t.sender_user_id = :uid', { uid: params.userId })
      .andWhere('t.type = :typ', { typ: 'QR_PAYMENT' })
      .andWhere('t.status = :st', { st: 'COMPLETED' })
      .andWhere('t.created_at >= :start', { start: startOfDay })
      .getRawOne();
    const used = Number(row?.total ?? 0);
    if (used + params.amountMad > cap + 1e-9) {
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_LIMIT_QR_DAILY',
        message:
          'Daily QR payment limit reached for your plan. Try again tomorrow or upgrade to Nexa Pro.',
      });
    }
  }

  async getWalletLimitsSummary(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const tier = normalizeSubscriptionTier(user.rewards_tier);
    const policy = SUBSCRIPTION_TIER_LIMITS[tier];
    const verified = normalizeKycStatus(user.kyc_status) === 'VERIFIED';

    const wallet = await this.walletRepo.findOne({
      where: { user_id: userId },
    });
    let ledgerAccountId: string | null = null;
    if (wallet) {
      const account = await this.ledgerService.getOrCreateWalletAccount(
        wallet.id,
      );
      ledgerAccountId = account.id;
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let walletBalanceMad = 0;
    let dailyOutflowMad = 0;
    let monthlyOutflowMad = 0;
    let qrDailyMad = 0;

    if (ledgerAccountId) {
      walletBalanceMad = await this.ledgerService.getBalance(ledgerAccountId);

      const dailyRow = await this.ledgerEntryRepo
        .createQueryBuilder('le')
        .select(
          "COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0)",
          'amount',
        )
        .where('le.account_id = :aid', { aid: ledgerAccountId })
        .andWhere('le.created_at >= :start', { start: startOfDay })
        .getRawOne();
      dailyOutflowMad = Number(dailyRow?.amount ?? 0);

      const monthlyRow = await this.ledgerEntryRepo
        .createQueryBuilder('le')
        .select(
          "COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0)",
          'amount',
        )
        .where('le.account_id = :aid', { aid: ledgerAccountId })
        .andWhere('le.created_at >= :start', { start: startOfMonth })
        .getRawOne();
      monthlyOutflowMad = Number(monthlyRow?.amount ?? 0);
    }

    const qrRow = await this.txRepo
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount), 0)', 'total')
      .where('t.sender_user_id = :uid', { uid: userId })
      .andWhere('t.type = :typ', { typ: 'QR_PAYMENT' })
      .andWhere('t.status = :st', { st: 'COMPLETED' })
      .andWhere('t.created_at >= :start', { start: startOfDay })
      .getRawOne();
    qrDailyMad = Number(qrRow?.total ?? 0);

    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    let cashbackUsedMad = 0;
    let cashbackCapMad = policy.cashbackCapMad;
    try {
      const cbSummary = await this.cashbackProgram.getSummaryForUser(userId);
      cashbackUsedMad = cbSummary.totalEarned;
      if (cbSummary.capLimit > 0) {
        cashbackCapMad = cbSummary.capLimit;
      }
    } catch {
      // No active billing period — show tier cap with zero usage.
    }

    const item = (used: number, cap: number) => ({
      used: Math.round(used * 100) / 100,
      cap,
      remaining: Math.max(0, Math.round((cap - used) * 100) / 100),
    });

    return {
      tier,
      isNexaPro: tier === 'pro',
      verified,
      periodEnds: periodEnd.toISOString(),
      cashbackCapMad,
      limits: {
        walletBalance: item(walletBalanceMad, policy.maxWalletBalanceMad),
        dailyTransfers: item(dailyOutflowMad, policy.dailyOutflowMad),
        monthlyTransfers: item(monthlyOutflowMad, policy.monthlyOutflowMad),
        qrPaymentsDaily: item(qrDailyMad, policy.qrPaymentsDailyMad),
        cashbackPeriod: item(cashbackUsedMad, cashbackCapMad),
      },
    };
  }
}
