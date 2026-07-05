import { Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AdminGoService } from '../services/admin-go.service';

@ApiTags('Pay Admin')
@Controller(['admin/go', 'pay/admin/go'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminGoController {
  constructor(private readonly adminGoService: AdminGoService) {}

  @Get('stats')
  getGoStats() {
    return this.adminGoService.getGoStats();
  }

  @Get('rides')
  getRides(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.adminGoService.getRides({
      page: page != null ? parseInt(page, 10) : undefined,
      limit: limit != null ? parseInt(limit, 10) : undefined,
      status,
    });
  }

  @Get('delivery/orders')
  getDeliveryOrders(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.adminGoService.getDeliveryOrders({
      page: page != null ? parseInt(page, 10) : undefined,
      limit: limit != null ? parseInt(limit, 10) : undefined,
      status,
    });
  }

  @Get('merchants')
  getMerchants(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminGoService.getMerchants({
      page: page != null ? parseInt(page, 10) : undefined,
      limit: limit != null ? parseInt(limit, 10) : undefined,
    });
  }
}
