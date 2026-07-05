import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpAchievement } from './entities/rp-achievement.entity';
import { RpUserAchievement } from './entities/rp-user-achievement.entity';
import { RpCashbackTransaction } from './entities/rp-cashback-transaction.entity';
import { RpUserCategorySelection } from './entities/rp-user-category-selection.entity';
import { RpCashbackSummary } from './entities/rp-cashback-summary.entity';
import { RpMerchantOffer } from './entities/rp-merchant-offer.entity';
import { RpBillingPeriod } from './entities/rp-billing-period.entity';
import { RpPointsService } from './rp-points.service';

@Injectable()
export class RpAchievementsProgramService {
  constructor(
    @InjectRepository(RpAchievement)
    private readonly achRepo: Repository<RpAchievement>,
    @InjectRepository(RpUserAchievement)
    private readonly userAchRepo: Repository<RpUserAchievement>,
    @InjectRepository(RpCashbackTransaction)
    private readonly cbRepo: Repository<RpCashbackTransaction>,
    @InjectRepository(RpUserCategorySelection)
    private readonly selRepo: Repository<RpUserCategorySelection>,
    @InjectRepository(RpCashbackSummary)
    private readonly sumRepo: Repository<RpCashbackSummary>,
    @InjectRepository(RpMerchantOffer)
    private readonly offerRepo: Repository<RpMerchantOffer>,
    @InjectRepository(RpBillingPeriod)
    private readonly periodRepo: Repository<RpBillingPeriod>,
    private readonly pointsService: RpPointsService,
  ) {}

  private async unlockIfNew(
    userId: string,
    achievementKey: string,
  ): Promise<void> {
    const ach = await this.achRepo.findOne({ where: { key: achievementKey } });
    if (!ach) return;
    const res = await this.userAchRepo.query(
      `INSERT INTO rp_user_achievements (user_id, achievement_id, unlocked_at, points_awarded)
       VALUES ($1, $2, NOW(), $3)
       ON CONFLICT (user_id, achievement_id) DO NOTHING
       RETURNING id`,
      [userId, ach.id, ach.points_reward],
    );
    if (!res?.length) return;
    await this.pointsService.awardPoints(
      userId,
      'budgeting',
      ach.points_reward,
      `Achievement: ${ach.name}`,
      `ach-${achievementKey}`,
      'earn',
    );
  }

  async checkAndUnlock(userId: string, billingPeriodId: number): Promise<void> {
    const settledCb = await this.cbRepo.count({
      where: { user_id: userId, status: 'settled' },
    });
    if (settledCb >= 1) {
      await this.unlockIfNew(userId, 'first_cashback');
    }

    const selections = await this.selRepo.find({
      where: { user_id: userId, billing_period_id: billingPeriodId },
    });
    const selectedIds = selections.map((s) => s.category_id);
    if (selectedIds.length === 4) {
      let allHave = true;
      for (const cid of selectedIds) {
        const n = await this.cbRepo.count({
          where: {
            user_id: userId,
            billing_period_id: billingPeriodId,
            category_id: cid,
            status: 'settled',
            cashback_type: 'category',
          },
        });
        if (n < 1) {
          allHave = false;
          break;
        }
      }
      if (allHave) await this.unlockIfNew(userId, 'category_explorer');
    }

    const periods = await this.periodRepo.find({
      order: { start_date: 'ASC' },
    });
    let consecutive = 0;
    let best = 0;
    for (const p of periods) {
      const c = await this.selRepo.count({
        where: { user_id: userId, billing_period_id: p.id },
      });
      if (c >= 4) {
        consecutive += 1;
        best = Math.max(best, consecutive);
      } else {
        consecutive = 0;
      }
    }
    if (best >= 3) await this.unlockIfNew(userId, 'smart_selector');

    await this.checkStreakBuilder(userId);

    const offerRows = await this.offerRepo
      .createQueryBuilder('o')
      .select('DISTINCT o.merchant_name', 'name')
      .where('o.is_active = true')
      .getRawMany();
    const names = offerRows.map((r) => r.name as string).filter(Boolean);
    if (names.length > 0) {
      const raw = await this.cbRepo
        .createQueryBuilder('t')
        .select('COUNT(DISTINCT t.merchant_name)', 'cnt')
        .where('t.user_id = :userId', { userId })
        .andWhere("t.status = 'settled'")
        .andWhere('t.merchant_name IN (:...names)', { names })
        .getRawOne();
      if (Number(raw?.cnt ?? 0) >= 5) {
        await this.unlockIfNew(userId, 'local_supporter');
      }
    }

    const summaries = await this.sumRepo.find({ where: { user_id: userId } });
    for (const s of summaries) {
      const total = Number(s.total_cashback_earned);
      const cap = Number(s.cap_limit);
      if (cap === 500 && total >= 400) {
        await this.unlockIfNew(userId, 'pro_saver');
      }
      if (cap >= 3000 && total >= 1000) {
        await this.unlockIfNew(userId, 'premium_maximizer');
      }
    }
  }

  private async checkStreakBuilder(userId: string): Promise<void> {
    const rows = await this.cbRepo
      .createQueryBuilder('t')
      .select("date_trunc('week', t.transaction_date)", 'wk')
      .addSelect('COUNT(*)', 'cnt')
      .where('t.user_id = :userId', { userId })
      .andWhere("t.status = 'settled'")
      .groupBy("date_trunc('week', t.transaction_date)")
      .having('COUNT(*) >= 3')
      .orderBy("date_trunc('week', t.transaction_date)", 'ASC')
      .getRawMany();
    const weekStarts = rows
      .filter((r) => Number(r.cnt) >= 3)
      .map((r) => new Date(r.wk).getTime());
    for (let i = 0; i <= weekStarts.length - 4; i++) {
      let ok = true;
      for (let j = 1; j < 4; j++) {
        const diffDays = (weekStarts[i + j] - weekStarts[i + j - 1]) / 86400000;
        if (diffDays < 6 || diffDays > 8) {
          ok = false;
          break;
        }
      }
      if (ok) {
        await this.unlockIfNew(userId, 'streak_builder');
        return;
      }
    }
  }

  async listForUser(userId: string) {
    const achievements = await this.achRepo.find({ order: { id: 'ASC' } });
    const unlocked = await this.userAchRepo.find({
      where: { user_id: userId },
    });
    const byId = new Map(unlocked.map((u) => [u.achievement_id, u]));
    return achievements.map((a) => {
      const u = byId.get(a.id);
      return {
        ...a,
        unlocked: !!u,
        unlockedAt: u?.unlocked_at ?? null,
        progress: null as number | null,
      };
    });
  }

  async recentUnlocked(userId: string, take = 3) {
    return this.userAchRepo.find({
      where: { user_id: userId },
      relations: ['achievement'],
      order: { unlocked_at: 'DESC' },
      take,
    });
  }
}
