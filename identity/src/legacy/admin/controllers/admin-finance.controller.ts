import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AccountTypeGuard } from '../../../common/guards/account-type.guard';
import { AccountTypes } from '../../../common/decorators/account-type.decorator';
import { AdminFinanceService } from '../services/admin-finance.service';
import { AdminFinanceCommissionsQueryDto } from '../dto/admin-finance-query.dto';
import { ReconciliationService } from '../../reconciliation/reconciliation.service';

@ApiTags('Pay Admin')
@Controller(['admin/finance', 'pay/admin/finance'])
@UseGuards(JwtAuthGuard, AccountTypeGuard)
@AccountTypes('ADMIN')
export class AdminFinanceController {
  constructor(
    private readonly adminFinanceService: AdminFinanceService,
    private readonly reconciliationService: ReconciliationService,
  ) {}

  /** Customer-liabilities vs safeguarding mirror snapshot for ops dashboards. */
  @Get('pay-ledger-summary')
  getPayLedgerSummary() {
    return this.reconciliationService.getPayLedgerControlDashboard();
  }

  @Get('revenue')
  getRevenue() {
    return this.adminFinanceService.getRevenue();
  }

  @Get('commissions')
  getCommissions(@Query() query: AdminFinanceCommissionsQueryDto) {
    return this.adminFinanceService.getCommissions(query);
  }

  @Get('driver-payouts')
  getDriverPayouts() {
    return this.adminFinanceService.getDriverPayouts();
  }

  @Get('merchant-settlements')
  getMerchantSettlements() {
    return this.adminFinanceService.getMerchantSettlements();
  }

  @Get('settlements-summary')
  getSettlementsSummary() {
    return this.adminFinanceService.getSettlementsSummary();
  }
}
