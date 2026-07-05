import { Injectable } from '@nestjs/common';
import { RpCashbackProgramService } from './rp-cashback-program.service';
import { RpRewardsCategoriesService } from './rp-rewards-categories.service';
import { RpPointsService } from './rp-points.service';
import { RpAchievementsProgramService } from './rp-achievements-program.service';
import { RpBillingPeriodsService } from './rp-billing-periods.service';

@Injectable()
export class RpRewardsDashboardService {
  constructor(
    private readonly cashback: RpCashbackProgramService,
    private readonly categories: RpRewardsCategoriesService,
    private readonly points: RpPointsService,
    private readonly achievements: RpAchievementsProgramService,
    private readonly billing: RpBillingPeriodsService,
  ) {}

  async getDashboard(userId: string) {
    const [cashbackSummary, pointsBalance, activeCats, recentCb, recentAch, achList] =
      await Promise.all([
        this.cashback.getSummaryForUser(userId),
        this.points.getBalance(userId),
        this.categories.getCurrentPeriodCategoriesWithRates(),
        this.cashback.listTransactions(userId, 1, 5),
        this.achievements.recentUnlocked(userId, 3),
        this.achievements.listForUser(userId),
      ]);

    const period = await this.billing.getActivePeriod();
    let selectionBanner = false;
    if (period) {
      const sels = await this.categories.getUserSelections(userId, period.id);
      selectionBanner = sels.length < 4;
    }

    const nextLocked = achList.find((a) => !a.unlocked);
    const nextAchievement = nextLocked
      ? {
          name: nextLocked.name,
          description: nextLocked.description,
          progress: nextLocked.progress ?? 0,
        }
      : null;

    return {
      selectionBanner,
      cashbackSummary: {
        totalEarned: cashbackSummary.totalEarned,
        universalCashback: cashbackSummary.universalCashback,
        categoryCashback: cashbackSummary.categoryCashback,
        capLimit: cashbackSummary.capLimit,
        capRemaining: cashbackSummary.capRemaining,
        capUsedPercent: cashbackSummary.capUsedPercent,
        capReached: cashbackSummary.capReached,
        tier: cashbackSummary.tier,
      },
      pointsBalance: pointsBalance.balance,
      activeCategories: activeCats.categories,
      recentCashbackTransactions: recentCb.data,
      recentAchievements: recentAch.map((r) => ({
        id: r.id,
        achievement: r.achievement,
        unlocked_at: r.unlocked_at,
        points_awarded: r.points_awarded,
      })),
      nextAchievement,
    };
  }
}
