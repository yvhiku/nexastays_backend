import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AccountTypes } from '../../common/decorators/account-type.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AccountTypeGuard } from '../../common/guards/account-type.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SelectCategoriesDto } from './dto/select-categories.dto';
import { RpRewardsCategoriesService } from './rp-rewards-categories.service';
import { RpCashbackProgramService } from './rp-cashback-program.service';
import { RpPointsService } from './rp-points.service';
import { RpAchievementsProgramService } from './rp-achievements-program.service';
import { RpMerchantsService } from './rp-merchants.service';
import { RpEcosystemService } from './rp-ecosystem.service';
import { RpRewardsDashboardService } from './rp-rewards-dashboard.service';

@ApiTags('Rewards Program')
@Controller(['rewards', 'pay/rewards'])
@UseGuards(JwtAuthGuard, AccountTypeGuard)
@AccountTypes('CONSUMER')
export class RewardsProgramController {
  constructor(
    private readonly categories: RpRewardsCategoriesService,
    private readonly cashback: RpCashbackProgramService,
    private readonly points: RpPointsService,
    private readonly achievementsProgram: RpAchievementsProgramService,
    private readonly merchants: RpMerchantsService,
    private readonly ecosystem: RpEcosystemService,
    private readonly rewardsDashboard: RpRewardsDashboardService,
  ) {}

  @Get('dashboard')
  getRewardsDashboard(@CurrentUser() user: { userId: string }) {
    return this.rewardsDashboard.getDashboard(user.userId);
  }

  @Get('categories/current-period')
  currentPeriodCategories() {
    return this.categories.getCurrentPeriodCategoriesWithRates();
  }

  @Get('categories/my-selections')
  mySelections(@CurrentUser() user: { userId: string }) {
    return this.categories.getMySelectionsForActivePeriod(user.userId);
  }

  @Post('categories/select')
  select(
    @CurrentUser() user: { userId: string },
    @Body() dto: SelectCategoriesDto,
  ) {
    return this.categories.selectCategories(user.userId, dto);
  }

  @Get('categories/can-reselect')
  canReselect(@CurrentUser() user: { userId: string }) {
    return this.categories.canReselect(user.userId);
  }

  @Get('cashback/summary')
  cashbackSummary(@CurrentUser() user: { userId: string }) {
    return this.cashback.getSummaryForUser(user.userId);
  }

  @Get('cashback/transactions')
  cashbackTx(
    @CurrentUser() user: { userId: string },
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.cashback.listTransactions(
      user.userId,
      Number(page),
      Number(limit),
    );
  }

  @Get('cashback/transactions/:id')
  cashbackTxOne(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.cashback.getTransaction(user.userId, id);
  }

  @Get('points/balance')
  pointsBalance(@CurrentUser() user: { userId: string }) {
    return this.points.getBalance(user.userId);
  }

  @Get('points/ledger')
  pointsLedger(
    @CurrentUser() user: { userId: string },
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.points.getLedger(user.userId, Number(page), Number(limit));
  }

  @Get('points/earning-rules')
  earningRules() {
    return this.points.getEarningRules();
  }

  @Get('achievements')
  listAchievements(@CurrentUser() user: { userId: string }) {
    return this.achievementsProgram.listForUser(user.userId);
  }

  @Get('achievements/recent')
  achievementsRecent(@CurrentUser() user: { userId: string }) {
    return this.achievementsProgram.recentUnlocked(user.userId, 3);
  }

  @Get('merchants/offers')
  offers(
    @CurrentUser() user: { userId: string },
    @Query('type') type?: string,
  ) {
    return this.merchants.listOffers(user.userId, type);
  }

  @Get('merchants/offers/:id')
  offerOne(@Param('id', ParseIntPipe) id: number) {
    return this.merchants.getOffer(id);
  }

  @Get('ecosystem/rewards')
  ecoRewards(@CurrentUser() user: { userId: string }) {
    return this.ecosystem.listForUser(user.userId);
  }

  @Post('ecosystem/redeem/:id')
  ecoRedeem(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.points.redeemForEcosystemReward(user.userId, id);
  }
}
