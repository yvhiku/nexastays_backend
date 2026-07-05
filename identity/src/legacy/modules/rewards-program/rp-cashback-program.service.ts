import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpCashbackTransaction } from './entities/rp-cashback-transaction.entity';
import { RpCashbackSummary } from './entities/rp-cashback-summary.entity';
import { UsersService } from '../users/users.service';
import { RpBillingPeriodsService } from './rp-billing-periods.service';
import { RpRewardsCategoriesService } from './rp-rewards-categories.service';
import { RpPointsService } from './rp-points.service';
import { RpAchievementsProgramService } from './rp-achievements-program.service';
import { calculateCashback } from './cashback.calculator';
import {
  normalizeRewardsTier,
  RP_TX_TYPES_ELIGIBLE_FOR_CASHBACK,
  TIER_CAPS_MAD,
} from './rewards-program.constants';

export interface RpPaymentConfirmedPayload {
  sourceTransactionId: string;
  userId: string;
  amount: number;
  categoryId: number | null;
  merchantName: string | null;
  transactionDate: Date;
  transactionType: string;
}

@Injectable()
export class RpCashbackProgramService {
  constructor(
    @InjectRepository(RpCashbackTransaction)
    private readonly cbRepo: Repository<RpCashbackTransaction>,
    @InjectRepository(RpCashbackSummary)
    private readonly summaryRepo: Repository<RpCashbackSummary>,
    private readonly usersService: UsersService,
    private readonly billingPeriods: RpBillingPeriodsService,
    private readonly categories: RpRewardsCategoriesService,
    private readonly pointsService: RpPointsService,
    private readonly achievementsProgram: RpAchievementsProgramService,
  ) {}

  async processPaymentConfirmed(input: RpPaymentConfirmedPayload): Promise<void> {
    if (!RP_TX_TYPES_ELIGIBLE_FOR_CASHBACK.has(input.transactionType)) {
      return;
    }
    const period = await this.billingPeriods.getActivePeriod();
    if (!period) return;

    const user = await this.usersService.findById(input.userId);
    if (!user) return;

    const tier = normalizeRewardsTier(user.rewards_tier);
    const selections = await this.categories.getUserSelections(
      input.userId,
      period.id,
    );
    const selectedCategoryIds = selections.map((s) => s.category_id);
    const periodCategories = await this.billingPeriods.getPeriodCategories(
      period.id,
    );
    const rateMap = new Map(
      periodCategories.map((pc) => [pc.category_id, Number(pc.cashback_rate)]),
    );

    const summary = await this.getOrCreateSummary(input.userId, period.id, tier);

    const result = calculateCashback({
      purchaseAmount: Number(input.amount),
      categoryId: input.categoryId,
      userSelectedCategoryIds: selectedCategoryIds,
      billingPeriodCategoryRates: rateMap,
      currentPeriodTotalEarned: Number(summary.total_cashback_earned),
      userTier: tier,
    });

    if (result.cashbackEarned <= 0) return;

    const cbType: 'universal' | 'category' =
      result.cashbackType === 'category' ? 'category' : 'universal';

    try {
      await this.cbRepo.insert({
        user_id: input.userId,
        billing_period_id: period.id,
        source_transaction_id: input.sourceTransactionId,
        merchant_name: input.merchantName,
        category_id: input.categoryId,
        purchase_amount: String(input.amount),
        cashback_rate: String(result.cashbackRate),
        cashback_earned: String(result.cashbackEarned),
        cashback_type: cbType,
        status: 'settled',
        transaction_date: input.transactionDate,
      });
    } catch (e: any) {
      if (e?.code === '23505') return;
      throw e;
    }

    const addU = cbType === 'category' ? 0 : result.cashbackEarned;
    const addC = cbType === 'category' ? result.cashbackEarned : 0;
    await this.summaryRepo.increment(
      { id: summary.id },
      'total_cashback_earned',
      result.cashbackEarned,
    );
    if (addU > 0) {
      await this.summaryRepo.increment(
        { id: summary.id },
        'universal_cashback',
        addU,
      );
    }
    if (addC > 0) {
      await this.summaryRepo.increment(
        { id: summary.id },
        'category_cashback',
        addC,
      );
    }
    if (result.capReached) {
      await this.summaryRepo.update(
        { id: summary.id },
        { cap_reached: true },
      );
    }

    if (cbType === 'category' && input.categoryId) {
      await this.pointsService
        .awardFirstCategoryPurchaseIfEligible(
          input.userId,
          period.id,
          input.categoryId,
        )
        .catch(() => {});
    }
    await this.pointsService
      .awardWeeklyStreakIfEligible(input.userId)
      .catch(() => {});
    await this.achievementsProgram
      .checkAndUnlock(input.userId, period.id)
      .catch(() => {});
  }

  private async getOrCreateSummary(
    userId: string,
    billingPeriodId: number,
    tier: 'standard' | 'pro' | 'premium',
  ): Promise<RpCashbackSummary> {
    let row = await this.summaryRepo.findOne({
      where: { user_id: userId, billing_period_id: billingPeriodId },
    });
    if (row) return row;
    const cap = TIER_CAPS_MAD[tier];
    row = this.summaryRepo.create({
      user_id: userId,
      billing_period_id: billingPeriodId,
      total_cashback_earned: '0',
      universal_cashback: '0',
      category_cashback: '0',
      cap_limit: String(cap),
      cap_reached: false,
    });
    return this.summaryRepo.save(row);
  }

  async getSummaryForUser(userId: string) {
    const period = await this.billingPeriods.getActivePeriod();
    if (!period) {
      return {
        totalEarned: 0,
        universalCashback: 0,
        categoryCashback: 0,
        capLimit: TIER_CAPS_MAD.standard,
        capRemaining: TIER_CAPS_MAD.standard,
        capUsedPercent: 0,
        capReached: false,
        tier: 'standard',
      };
    }
    const user = await this.usersService.findById(userId);
    const tier = normalizeRewardsTier(user?.rewards_tier);
    let summary = await this.summaryRepo.findOne({
      where: { user_id: userId, billing_period_id: period.id },
    });
    if (!summary) {
      summary = await this.getOrCreateSummary(userId, period.id, tier);
    }
    const capLimit = Number(summary.cap_limit);
    const total = Number(summary.total_cashback_earned);
    const capRemaining = Math.max(0, capLimit - total);
    const capUsedPercent =
      capLimit > 0 ? Math.min(100, Math.round((total / capLimit) * 100)) : 0;
    return {
      totalEarned: total,
      universalCashback: Number(summary.universal_cashback),
      categoryCashback: Number(summary.category_cashback),
      capLimit,
      capRemaining,
      capUsedPercent,
      capReached: summary.cap_reached,
      tier,
    };
  }

  async listTransactions(userId: string, page = 1, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    const [data, total] = await this.cbRepo.findAndCount({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take,
      skip,
      relations: ['category'],
    });
    return { data, total, page: Math.max(page, 1), limit: take };
  }

  async getTransaction(userId: string, id: number) {
    const row = await this.cbRepo.findOne({
      where: { id, user_id: userId },
      relations: ['category', 'billing_period'],
    });
    if (!row) throw new NotFoundException('Cashback transaction not found');
    return row;
  }
}
