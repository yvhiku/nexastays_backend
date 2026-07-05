import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AdminRiskService } from '../services/admin-risk.service';
import { AdminRiskQueryDto } from '../dto/admin-risk.query.dto';
import { AdminMonitoringQueryDto } from '../dto/admin-monitoring.query.dto';
import { FlagTransactionDto } from '../dto/flag-transaction.dto';
import type { AdminRequest } from '../types/admin-request';

@ApiTags('Pay Admin')
@Controller(['admin/risk', 'pay/admin/risk'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminRiskController {
  constructor(private readonly adminRiskService: AdminRiskService) {}

  @Get('alerts')
  getAlerts(@Query() query: AdminRiskQueryDto) {
    return this.adminRiskService.getAlerts(query);
  }

  @Get('stats')
  getStats() {
    return this.adminRiskService.getStats();
  }

  @Get('summary')
  getSummary(@Query() query: AdminMonitoringQueryDto) {
    return this.adminRiskService.getRiskSummary(query);
  }

  @Post('alerts/:alertId/escalate')
  escalate(@Param('alertId') alertId: string, @Req() req: AdminRequest) {
    return this.adminRiskService.escalate(alertId, req.user);
  }

  @Post('transactions/:transactionId/flag')
  flagTransaction(
    @Param('transactionId') transactionId: string,
    @Body() body: FlagTransactionDto,
    @Req() req: AdminRequest,
  ) {
    return this.adminRiskService.flagTransaction(
      transactionId,
      body.reason,
      req.user,
    );
  }
}
