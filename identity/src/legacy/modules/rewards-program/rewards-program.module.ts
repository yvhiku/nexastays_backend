import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { User } from '../users/entities/user.entity';
import { RpBillingPeriod } from './entities/rp-billing-period.entity';
import { RpCategory } from './entities/rp-category.entity';
import { RpBillingPeriodCategory } from './entities/rp-billing-period-category.entity';
import { RpUserCategorySelection } from './entities/rp-user-category-selection.entity';
import { RpCashbackTransaction } from './entities/rp-cashback-transaction.entity';
import { RpCashbackSummary } from './entities/rp-cashback-summary.entity';
import { RpNexaPointsLedger } from './entities/rp-nexa-points-ledger.entity';
import { RpAchievement } from './entities/rp-achievement.entity';
import { RpUserAchievement } from './entities/rp-user-achievement.entity';
import { RpMerchantOffer } from './entities/rp-merchant-offer.entity';
import { RpEcosystemReward } from './entities/rp-ecosystem-reward.entity';
import { RpBillingPeriodsService } from './rp-billing-periods.service';
import { RpRewardsCategoriesService } from './rp-rewards-categories.service';
import { RpPointsService } from './rp-points.service';
import { RpAchievementsProgramService } from './rp-achievements-program.service';
import { RpCashbackProgramService } from './rp-cashback-program.service';
import { RpMerchantsService } from './rp-merchants.service';
import { RpEcosystemService } from './rp-ecosystem.service';
import { RpRewardsDashboardService } from './rp-rewards-dashboard.service';
import { RpRewardsSeedService } from './rp-rewards-seed.service';
import { RpRewardsAdminAnalyticsService } from './rp-rewards-admin-analytics.service';
import { RewardsProgramController } from './rewards-program.controller';
import { RewardsProgramAdminController } from './rewards-program-admin.controller';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([
      RpBillingPeriod,
      RpCategory,
      RpBillingPeriodCategory,
      RpUserCategorySelection,
      RpCashbackTransaction,
      RpCashbackSummary,
      RpNexaPointsLedger,
      RpAchievement,
      RpUserAchievement,
      RpMerchantOffer,
      RpEcosystemReward,
      User,
    ]),
  ],
  controllers: [RewardsProgramController, RewardsProgramAdminController],
  providers: [
    RolesGuard,
    RpBillingPeriodsService,
    RpPointsService,
    RpAchievementsProgramService,
    RpRewardsCategoriesService,
    RpCashbackProgramService,
    RpMerchantsService,
    RpEcosystemService,
    RpRewardsDashboardService,
    RpRewardsSeedService,
    RpRewardsAdminAnalyticsService,
  ],
  exports: [RpCashbackProgramService, RpPointsService],
})
export class RewardsProgramModule {}
