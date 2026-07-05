import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AdminTransactionsService } from '../services/admin-transactions.service';
import { AdminTransactionsQueryDto } from '../dto/admin-transactions.query.dto';
import { ReverseTransactionDto } from '../dto/reverse-transaction.dto';
import type { AdminRequest } from '../types/admin-request';
import { RequireMoneyIdempotencyHeader } from '../../../common/decorators/require-money-idempotency-header.decorator';
import { MoneyMovementScope } from '../../../common/idempotency/money-movement-scope';

@ApiTags('Pay Admin')
@Controller(['admin/transactions', 'pay/admin/transactions'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminTransactionsController {
  constructor(
    private readonly adminTransactionsService: AdminTransactionsService,
  ) {}

  @Get()
  getTransactions(@Query() query: AdminTransactionsQueryDto) {
    return this.adminTransactionsService.getTransactions(query);
  }

  @Get('export')
  async exportTransactions(
    @Query() query: AdminTransactionsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.adminTransactionsService.exportTransactions(query);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="transactions.csv"',
    );
    return csv;
  }

  @Get(':id')
  getTransaction(@Param('id') id: string) {
    return this.adminTransactionsService.getTransaction(id);
  }

  @Post(':id/reverse')
  @RequireMoneyIdempotencyHeader(MoneyMovementScope.ADMIN_TRANSACTION_REVERSAL)
  reverseTransaction(
    @Param('id') id: string,
    @Body() body: ReverseTransactionDto,
    @Req() req: AdminRequest,
  ) {
    return this.adminTransactionsService.reverseTransaction(
      id,
      body.reason,
      req.user,
      (req as AdminRequest & { moneyIdempotencyKey?: string })
        .moneyIdempotencyKey!,
    );
  }
}
