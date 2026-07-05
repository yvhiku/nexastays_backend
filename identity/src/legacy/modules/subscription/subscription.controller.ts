import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AccountTypeGuard } from '../../common/guards/account-type.guard';
import { AccountTypes } from '../../common/decorators/account-type.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireMoneyIdempotencyHeader } from '../../common/decorators/require-money-idempotency-header.decorator';
import { MoneyMovementScope } from '../../common/idempotency/money-movement-scope';
import { SubscriptionService } from './subscription.service';
import { PurchaseProSubscriptionDto } from './dto/purchase-pro-subscription.dto';

@ApiTags('Pay Subscription')
@ApiBearerAuth()
@Controller(['subscription', 'pay/subscription'])
@UseGuards(JwtAuthGuard, AccountTypeGuard)
@AccountTypes('CONSUMER')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('pro/pricing')
  getProPricing() {
    return this.subscriptionService.getProPricing();
  }

  @Get('pro/status')
  getProStatus(@CurrentUser() user: { userId: string }) {
    return this.subscriptionService.getProStatus(user.userId);
  }

  @Post('pro/purchase')
  @RequireMoneyIdempotencyHeader(MoneyMovementScope.SUBSCRIPTION_PRO)
  purchasePro(
    @Body() body: PurchaseProSubscriptionDto,
    @CurrentUser() user: { userId: string },
    @Req() req: Request,
  ) {
    return this.subscriptionService.purchasePro(
      user.userId,
      body,
      (req as Request & { moneyIdempotencyKey?: string }).moneyIdempotencyKey!,
    );
  }
}
