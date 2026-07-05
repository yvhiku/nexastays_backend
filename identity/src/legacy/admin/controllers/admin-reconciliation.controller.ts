import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AdminRiskService } from '../services/admin-risk.service';
import { AdminMonitoringQueryDto } from '../dto/admin-monitoring.query.dto';
import { UpdateStatusDto } from '../dto/update-status.dto';
import type { AdminRequest } from '../types/admin-request';

@ApiTags('Pay Admin')
@Controller(['admin/reconciliation', 'pay/admin/reconciliation'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminReconciliationController {
  constructor(private readonly adminRiskService: AdminRiskService) {}

  @Get('issues')
  getReconciliationIssues(@Query() query: AdminMonitoringQueryDto) {
    return this.adminRiskService.getReconciliationIssues(query);
  }

  @Patch('issues/:id/status')
  updateIssueStatus(
    @Param('id') id: string,
    @Body() body: UpdateStatusDto,
    @Req() req: AdminRequest,
  ) {
    return this.adminRiskService.updateReconciliationIssueStatus(
      id,
      body.status,
      req.user,
    );
  }
}
