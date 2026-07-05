import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NfcService } from './nfc.service';
import { NfcPrepareDto } from './dto/nfc-prepare.dto';
import { NfcPayDto } from './dto/nfc-pay.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AccountTypeGuard } from '../../common/guards/account-type.guard';
import { AccountTypes } from '../../common/decorators/account-type.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireMoneyIdempotencyHeader } from '../../common/decorators/require-money-idempotency-header.decorator';
import { MoneyMovementScope } from '../../common/idempotency/money-movement-scope';

@ApiTags('Pay QR/NFC')
@Controller(['nfc', 'pay/nfc'])
@UseGuards(JwtAuthGuard, AccountTypeGuard)
@AccountTypes('CONSUMER')
export class NfcController {
  constructor(private readonly nfcService: NfcService) {}

  @Post('prepare')
  prepare(@Body() body: NfcPrepareDto, @CurrentUser() user: any) {
    return this.nfcService.prepare(body);
  }

  @Post('pay')
  @RequireMoneyIdempotencyHeader(MoneyMovementScope.NFC_PAYMENT)
  pay(
    @Body() body: NfcPayDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.nfcService.pay(
      user.userId,
      body,
      (req as Request & { moneyIdempotencyKey?: string }).moneyIdempotencyKey!,
    );
  }
}
