import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { TransactionsService } from './transactions.service';
import { TransferDto } from './dto/transfer.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AccountTypeGuard } from '../../common/guards/account-type.guard';
import { AccountTypes } from '../../common/decorators/account-type.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import type { RiskAuthAssessment } from '../../common/middleware/risk_auth.middleware';
import { RequireMoneyIdempotencyHeader } from '../../common/decorators/require-money-idempotency-header.decorator';
import { MoneyMovementScope } from '../../common/idempotency/money-movement-scope';

@ApiTags('Pay Transactions')
@Controller(['transactions', 'pay/transactions'])
@UseGuards(JwtAuthGuard, AccountTypeGuard)
@AccountTypes('CONSUMER')
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly auditService: AuditService,
  ) {}

  @Get('history')
  async getHistory(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @CurrentUser() user: any,
  ) {
    return this.transactionsService.getTransactions(
      Number(page),
      Number(limit),
      user.userId,
    );
  }

  @Get()
  async getTransactions(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @CurrentUser() user: any,
  ) {
    return this.transactionsService.getTransactions(
      Number(page),
      Number(limit),
      user.userId,
    );
  }

  @Post('transfer')
  @RequireMoneyIdempotencyHeader(MoneyMovementScope.P2P_TRANSFER)
  async transfer(
    @Body() body: TransferDto,
    @CurrentUser() user: { userId: string },
    @Headers('x-device-id') deviceId?: string,
    @Headers('x-device-integrity') deviceIntegrity?: string,
    @Headers('user-agent') userAgent?: string,
    @Req() req?: Request,
  ) {
    const risk = (
      req as (Request & { risk_auth?: RiskAuthAssessment }) | undefined
    )?.risk_auth;
    if (risk?.level === 'HIGH') {
      await this.auditService
        .audit({
          actorUserId: user.userId,
          action: 'STEP_UP_TRANSFER_BLOCKED_MANUAL_REVIEW',
          targetType: 'USER',
          targetId: user.userId,
          metadata: {
            risk_score: risk.risk_score,
            reason_codes: risk.reason_codes,
          },
          req,
        })
        .catch(() => {});
      throw new ForbiddenException({
        code: 'RISK_REVIEW_REQUIRED',
        message:
          'Transfer blocked due to high-risk signals. Manual review is required.',
        risk_score: risk.risk_score,
        reason_codes: risk.reason_codes,
      });
    }
    if (risk?.level === 'MEDIUM') {
      await this.auditService
        .audit({
          actorUserId: user.userId,
          action: 'STEP_UP_TRANSFER_OTP_REQUIRED',
          targetType: 'USER',
          targetId: user.userId,
          metadata: {
            risk_score: risk.risk_score,
            reason_codes: risk.reason_codes,
          },
          req,
        })
        .catch(() => {});
      throw new UnauthorizedException({
        code: 'STEP_UP_OTP_REQUIRED',
        message: 'OTP verification is required before this transfer.',
        otp_required: true,
        risk_score: risk.risk_score,
        reason_codes: risk.reason_codes,
      });
    }

    return this.transactionsService.transfer(
      user.userId,
      body,
      {
        device_id: deviceId,
        device_integrity: deviceIntegrity,
        user_agent: userAgent,
      },
      (req as Request & { moneyIdempotencyKey?: string }).moneyIdempotencyKey!,
    );
  }
}
