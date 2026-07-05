import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AdminAuditService } from '../services/admin-audit.service';
import { AdminAuditQueryDto } from '../dto/admin-audit.query.dto';

@ApiTags('Pay Admin')
@Controller(['admin/audit', 'pay/admin/audit'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminAuditController {
  constructor(private readonly adminAuditService: AdminAuditService) {}

  @Get('logs')
  getLogs(@Query() query: AdminAuditQueryDto) {
    return this.adminAuditService.getLogs(query);
  }

  @Get('logs/export')
  async exportLogs(
    @Query() query: AdminAuditQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.adminAuditService.exportLogs(query);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="audit-logs.csv"',
    );
    return csv;
  }
}
