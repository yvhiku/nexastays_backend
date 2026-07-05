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
import { UpdateFraudEventDto } from '../dto/update-fraud-event.dto';
import type { AdminRequest } from '../types/admin-request';

@ApiTags('Pay Admin')
@Controller(['admin/fraud', 'pay/admin/fraud'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminFraudController {
  constructor(private readonly adminRiskService: AdminRiskService) {}

  @Get('events')
  getFraudEvents(@Query() query: AdminMonitoringQueryDto) {
    return this.adminRiskService.getFraudEvents(query);
  }

  @Patch('events/:id/status')
  updateFraudEventStatus(
    @Param('id') id: string,
    @Body() body: UpdateFraudEventDto,
    @Req() req: AdminRequest,
  ) {
    return this.adminRiskService.updateFraudEventStatus(id, body, req.user);
  }
}
