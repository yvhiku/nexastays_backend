import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { RpNexaPointsLedger } from './entities/rp-nexa-points-ledger.entity';
import { RpCashbackTransaction } from './entities/rp-cashback-transaction.entity';
import { RpEcosystemReward } from './entities/rp-ecosystem-reward.entity';
import { RpBillingPeriodsService } from './rp-billing-periods.service';

const EARNING_RULES = [
  { source: 'category_selection', points: 50, label: 'Pick categories early' },
  { source: 'first_category_purchase', points: 25, label: 'First purchase in a boosted category' },
  { source: 'weekly_streak', points: 100, label: 'Weekly activity streak' },
  { source: 'referral', points: 200, label: 'Successful referral' },
  { source: 'kyc_completion', points: 100, label: 'Complete KYC' },
  { source: 'merchant_discovery', points: 30, label: 'Try a featured merchant' },
  { source: 'budgeting', points: 40, label: 'Budgeting milestone' },
  { source: 'redemption', points: 0, label: 'Redeem Nexa Points' },
];

@Injectable()
export class RpPointsService {
  constructor(
    @InjectRepository(RpNexaPointsLedger)
    private readonly ledgerRepo: Repository<RpNexaPointsLedger>,
    @InjectRepository(RpCashbackTransaction)
    private readonly cbRepo: Repository<RpCashbackTransaction>,
    private readonly dataSource: DataSource,
    private readonly billingPeriods: RpBillingPeriodsService,
  ) {}

  getEarningRules() {
    return EARNING_RULES;
  }

  async awardPoints(
    userId: string,
    source: string,
    pointsDelta: number,
    description: string | null,
    referenceId?: string | null,
    type: 'earn' | 'redeem' = 'earn',
  ): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const row = em.create(RpNexaPointsLedger, {
        user_id: userId,
        type,
        source,
        points: pointsDelta,
        description,
        reference_id: referenceId ?? null,
      });
      await em.save(RpNexaPointsLedger, row);
      await em.increment(User, { id: userId }, 'nexa_points', pointsDelta);
    });
  }

  async getBalance(userId: string) {
    const user = await this.dataSource.getRepository(User).findOne({
      where: { id: userId },
      select: ['nexa_points'],
    });
    const recentLedger = await this.ledgerRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: 10,
    });
    return {
      balance: user?.nexa_points ?? 0,
      recentLedger: recentLedger.map((l) => ({
        id: l.id,
        type: l.type,
        source: l.source,
        points: l.points,
        description: l.description,
        reference_id: l.reference_id,
        created_at: l.created_at,
      })),
    };
  }

  async getLedger(userId: string, page = 1, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    const [rows, total] = await this.ledgerRepo.findAndCount({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take,
      skip,
    });
    return {
      data: rows,
      total,
      page: Math.max(page, 1),
      limit: take,
    };
  }

  async awardCategorySelectionPoints(
    userId: string,
    billingPeriodId: number,
  ): Promise<void> {
    const period = await this.billingPeriods.findById(billingPeriodId);
    if (!period) return;
    const ref = `period-${billingPeriodId}`;
    const existing = await this.ledgerRepo.findOne({
      where: {
        user_id: userId,
        source: 'category_selection',
        reference_id: ref,
      },
    });
    if (existing) return;
    const start = new Date(period.start_date);
    const now = new Date();
    if (
      now.getFullYear() !== start.getFullYear() ||
      now.getMonth() !== start.getMonth() ||
      now.getDate() > 5
    ) {
      return;
    }
    await this.awardPoints(
      userId,
      'category_selection',
      50,
      'Early category selection bonus',
      ref,
      'earn',
    );
  }

  async awardFirstCategoryPurchaseIfEligible(
    userId: string,
    billingPeriodId: number,
    categoryId: number,
  ): Promise<void> {
    const ref = `${billingPeriodId}-${categoryId}`;
    const existing = await this.ledgerRepo.findOne({
      where: {
        user_id: userId,
        source: 'first_category_purchase',
        reference_id: ref,
      },
    });
    if (existing) return;
    await this.awardPoints(
      userId,
      'first_category_purchase',
      25,
      'First purchase in a selected category this period',
      ref,
      'earn',
    );
  }

  async awardWeeklyStreakIfEligible(userId: string): Promise<void> {
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const rows = await this.cbRepo
      .createQueryBuilder('t')
      .select("date_trunc('week', t.transaction_date)", 'wk')
      .addSelect('COUNT(DISTINCT t.id)', 'cnt')
      .where('t.user_id = :userId', { userId })
      .andWhere("t.status = 'settled'")
      .andWhere('t.transaction_date >= :from', { from: fourWeeksAgo })
      .groupBy("date_trunc('week', t.transaction_date)")
      .having('COUNT(DISTINCT t.id) >= 3')
      .getRawMany();
    if (rows.length < 1) return;
    for (const r of rows) {
      const wk = new Date(r.wk);
      const isoYear = wk.getFullYear();
      const isoWeek = this.isoWeekNumber(wk);
      const ref = `streak-${isoYear}-W${isoWeek}`;
      const dup = await this.ledgerRepo.findOne({
        where: { user_id: userId, source: 'weekly_streak', reference_id: ref },
      });
      if (dup) continue;
      await this.awardPoints(
        userId,
        'weekly_streak',
        100,
        'Weekly activity streak',
        ref,
        'earn',
      );
      return;
    }
  }

  private isoWeekNumber(d: Date): number {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((+t - +yearStart) / 86400000 + 1) / 7);
  }

  async redeemForEcosystemReward(userId: string, ecosystemRewardId: number) {
    const reward = await this.dataSource.getRepository(RpEcosystemReward).findOne({
      where: { id: ecosystemRewardId, is_active: true },
    });
    if (!reward) throw new NotFoundException('Reward not found');
    const user = await this.dataSource.getRepository(User).findOne({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');
    const cost = reward.points_cost;
    if ((user.nexa_points ?? 0) < cost) {
      throw new BadRequestException('Insufficient Nexa Points');
    }
    await this.dataSource.transaction(async (em) => {
      await em.save(
        em.create(RpNexaPointsLedger, {
          user_id: userId,
          type: 'redeem',
          source: 'redemption',
          points: -cost,
          description: `Redeemed: ${reward.title}`,
          reference_id: `eco-${ecosystemRewardId}-${Date.now()}`,
        }),
      );
      await em.decrement(User, { id: userId }, 'nexa_points', cost);
    });
    const after = await this.dataSource.getRepository(User).findOne({
      where: { id: userId },
      select: ['nexa_points'],
    });
    return {
      success: true,
      newBalance: after?.nexa_points ?? 0,
      reward: {
        id: reward.id,
        title: reward.title,
        brand: reward.brand,
        discount_value: reward.discount_value,
      },
    };
  }
}
