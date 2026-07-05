import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RpBillingPeriodsService } from './rp-billing-periods.service';
import { CreateBillingPeriodDto } from './dto/create-billing-period.dto';
import { SetCategoryRatesDto } from './dto/set-category-rates.dto';
import { CreateMerchantOfferDto } from './dto/create-offer.dto';
import { RpMerchantsService } from './rp-merchants.service';
import { RpRewardsAdminAnalyticsService } from './rp-rewards-admin-analytics.service';

@ApiTags('Rewards Program Admin')
@Controller(['rewards/admin', 'pay/rewards/admin'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class RewardsProgramAdminController {
  constructor(
    private readonly billing: RpBillingPeriodsService,
    private readonly merchants: RpMerchantsService,
    private readonly adminAnalytics: RpRewardsAdminAnalyticsService,
  ) {}

  @Get('billing-periods')
  listBillingPeriods() {
    return this.billing.listAll();
  }

  @Post('billing-periods')
  createBillingPeriod(@Body() dto: CreateBillingPeriodDto) {
    return this.billing.create(dto);
  }

  @Put('billing-periods/:id/activate')
  activate(@Param('id', ParseIntPipe) id: number) {
    return this.billing.activate(id);
  }

  @Post('billing-periods/:id/categories')
  setCategories(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetCategoryRatesDto,
  ) {
    return this.billing.setPeriodCategories(id, dto);
  }

  @Get('categories')
  listMasterCategories() {
    return this.billing.adminListMasterCategories();
  }

  @Post('categories')
  createMasterCategory(
    @Body() body: { name: string; icon: string; description?: string },
  ) {
    return this.billing.adminCreateMasterCategory(body);
  }

  @Get('merchant-offers')
  listOffers() {
    return this.merchants.adminList();
  }

  @Post('merchant-offers')
  createOffer(@Body() dto: CreateMerchantOfferDto) {
    return this.merchants.adminCreate(dto);
  }

  @Put('merchant-offers/:id')
  updateOffer(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<CreateMerchantOfferDto> & { is_active?: boolean },
  ) {
    return this.merchants.adminUpdate(id, body);
  }

  @Get('analytics')
  getAnalytics() {
    return this.adminAnalytics.getAnalytics();
  }
}
