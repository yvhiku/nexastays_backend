import { Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ReconciliationService } from './reconciliation.service';

@ApiTags('Pay Admin')
@Controller(['reconciliation', 'pay/reconciliation'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Post('run')
  run(@Query('date') date?: string) {
    const targetDate = date
      ? new Date(date)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.reconciliationService.runReconciliationForDate(targetDate);
  }

  @Get('report')
  async getReport(
    @Query('date') date: string | undefined,
    @Query('format') format: 'json' | 'csv' | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const targetDate = date
      ? new Date(date)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (format === 'csv') {
      const csv = await this.reconciliationService.exportReportCsv(targetDate);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="reconciliation-${targetDate.toISOString().slice(0, 10)}.csv"`,
      );
      return csv;
    }
    return this.reconciliationService.runReconciliationForDate(targetDate);
  }
}
