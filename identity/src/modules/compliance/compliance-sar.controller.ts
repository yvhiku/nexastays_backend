import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AdminRequest } from '../admin/types/admin-request';
import { SarService } from './sar.service';
import { SarQueryDto } from './dto/sar.query.dto';
import { UpdateSarStatusDto } from './dto/update-sar-status.dto';

@ApiTags('Pay KYC')
@Controller('compliance/sar')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ComplianceSarController {
  constructor(private readonly sarService: SarService) {}

  @Get()
  async getSarReports(
    @Query() query: SarQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (query.format === 'csv') {
      const csv = await this.sarService.exportSarReportsCsv(query);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="sar-reports.csv"',
      );
      return csv;
    }
    return this.sarService.listSarReports(query);
  }

  @Patch(':id/status')
  updateSarStatus(
    @Param('id') id: string,
    @Body() body: UpdateSarStatusDto,
    @Req() req: AdminRequest,
  ) {
    return this.sarService.updateSarStatus(id, body.status, req.user?.userId);
  }
}
