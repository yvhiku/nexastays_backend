import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletsService } from './wallets.service';
import { TopupDto } from './dto/topup.dto';
import { WithdrawDto } from './dto/withdraw.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AccountTypeGuard } from '../../common/guards/account-type.guard';
import { AccountTypes } from '../../common/decorators/account-type.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { DbCircuitBreakerGuard } from '../../common/guards/db-circuit-breaker.guard';
import { HttpCacheInterceptor } from '../../common/cache/http-cache.interceptor';
import { CacheTTL } from '../../common/cache/cache-ttl.decorator';
import { RequireMoneyIdempotencyHeader } from '../../common/decorators/require-money-idempotency-header.decorator';
import { MoneyMovementScope } from '../../common/idempotency/money-movement-scope';
import { SubscriptionLimitsService } from '../subscription-limits/subscription-limits.service';

@ApiTags('Pay Wallets')
@Controller(['wallets', 'pay/wallets'])
@UseGuards(JwtAuthGuard, AccountTypeGuard)
@AccountTypes('CONSUMER')
export class WalletsController {
  constructor(
    private readonly walletsService: WalletsService,
    private readonly usersService: UsersService,
    private readonly subscriptionLimits: SubscriptionLimitsService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  @Get('limits')
  async getWalletLimits(@CurrentUser() user: any) {
    return this.subscriptionLimits.getWalletLimitsSummary(user.userId);
  }

  @Get('me')
  async getMyWallet(@CurrentUser() user: any) {
    return this.walletsService.getWalletByUserId(user.userId);
  }

  @Get('balance')
  @AccountTypes('CONSUMER', 'DRIVER', 'COURIER')
  @UseGuards(DbCircuitBreakerGuard)
  @UseInterceptors(HttpCacheInterceptor)
  @CacheTTL(30)
  async getBalance(@CurrentUser() user: any) {
    const balance = await this.walletsService.getBalanceByUserId(
      user.userId,
      user.account_type,
    );
    return { balance };
  }

  /**
   * Transfer from driver/courier wallet to their linked consumer wallet
   * POST /wallets/transfer-to-consumer
   */
  @Post('transfer-to-consumer')
  @AccountTypes('DRIVER', 'COURIER')
  @HttpCode(HttpStatus.OK)
  async transferToConsumer(
    @CurrentUser() user: any,
    @Body() body: { amount: number },
  ) {
    const currentUser = await this.userRepository.findOne({
      where: { id: user.userId },
      select: ['unified_identity_id', 'linked_user_id', 'phone_number'],
    });

    let consumerUserId: string | null = null;

    if (currentUser?.unified_identity_id) {
      const consumer = await this.usersService.getConsumerForIdentity(
        currentUser.unified_identity_id,
      );
      if (consumer) consumerUserId = consumer.id;
    }
    if (!consumerUserId && currentUser?.linked_user_id) {
      consumerUserId = currentUser.linked_user_id;
    }
    if (!consumerUserId && currentUser?.phone_number) {
      const byPhone = await this.userRepository.findOne({
        where: {
          phone_number: currentUser.phone_number,
          account_type: 'CONSUMER',
        },
        select: ['id'],
      });
      if (byPhone) consumerUserId = byPhone.id;
    }

    if (!consumerUserId) {
      throw new BadRequestException(
        'No consumer account found for this identity. Create a consumer account (Nexa Pay) with the same phone first.',
      );
    }

    return this.walletsService.transferToConsumerWallet(
      user.userId,
      consumerUserId,
      body.amount,
    );
  }

  @Post('topup')
  @RequireMoneyIdempotencyHeader(MoneyMovementScope.TOPUP)
  @HttpCode(HttpStatus.OK)
  async topup(
    @Body() body: TopupDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.walletsService.topup(
      user.userId,
      body,
      (req as Request & { moneyIdempotencyKey?: string }).moneyIdempotencyKey!,
    );
  }

  @Post('withdraw')
  @RequireMoneyIdempotencyHeader(MoneyMovementScope.WITHDRAW)
  @HttpCode(HttpStatus.OK)
  async withdraw(
    @Body() body: WithdrawDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.walletsService.withdraw(
      user.userId,
      body,
      (req as Request & { moneyIdempotencyKey?: string }).moneyIdempotencyKey!,
    );
  }
}
