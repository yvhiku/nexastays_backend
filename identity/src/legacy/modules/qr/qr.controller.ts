import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { QrService } from './qr.service';
import { QrGenerateDto } from './dto/qr-generate.dto';
import { QrPayDto } from './dto/qr-pay.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AccountTypeGuard } from '../../common/guards/account-type.guard';
import { AccountTypes } from '../../common/decorators/account-type.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireMoneyIdempotencyHeader } from '../../common/decorators/require-money-idempotency-header.decorator';
import { MoneyMovementScope } from '../../common/idempotency/money-movement-scope';

@ApiTags('Pay QR/NFC')
@Controller(['qr', 'pay/qr'])
@UseGuards(JwtAuthGuard, AccountTypeGuard)
@AccountTypes('CONSUMER')
export class QrController {
  constructor(private readonly qrService: QrService) {}

  @Post('generate')
  generate(@Body() body: QrGenerateDto) {
    return this.qrService.generate(body);
  }

  @Post('pay')
  @RequireMoneyIdempotencyHeader(MoneyMovementScope.QR_PAYMENT)
  pay(
    @Body() body: QrPayDto,
    @CurrentUser() user: { userId: string },
    @Req() req: Request,
    @Headers('x-device-id') deviceId?: string,
    @Headers('x-device-integrity') deviceIntegrity?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.qrService.pay(
      user.userId,
      body,
      (req as Request & { moneyIdempotencyKey?: string }).moneyIdempotencyKey!,
      {
        device_id: deviceId,
        device_integrity: deviceIntegrity,
        user_agent: userAgent,
      },
    );
  }
}
