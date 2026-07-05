import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AdminActivityService } from '../services/admin-activity.service';

@ApiTags('Pay Admin')
@Controller(['admin/activity', 'pay/admin/activity'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminActivityController {
  constructor(private readonly adminActivityService: AdminActivityService) {}

  @Get()
  getRecentEvents(
    @Query('limit') limit?: string,
    @Query('since') since?: string,
  ) {
    return this.adminActivityService.getRecentEvents({
      limit: limit != null ? parseInt(limit, 10) : undefined,
      since,
    });
  }
}
