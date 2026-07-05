import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
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
@Controller(['admin/sar', 'pay/admin/sar'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminSarController {
  constructor(private readonly adminRiskService: AdminRiskService) {}

  @Get()
  getSarReports(@Query() query: AdminMonitoringQueryDto) {
    return this.adminRiskService.getSarReports(query);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateStatusDto,
    @Req() req: AdminRequest,
  ) {
    return this.adminRiskService.updateSarStatus(id, body.status, req.user);
  }
}
