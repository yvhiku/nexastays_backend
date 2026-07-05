import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AdminGoPricingService } from '../services/admin-go-pricing.service';

@ApiTags('Pay Admin')
@Controller(['admin/go/pricing', 'pay/admin/go/pricing'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminGoPricingController {
  constructor(private readonly adminGoPricingService: AdminGoPricingService) {}

  @Get()
  getAll() {
    return this.adminGoPricingService.getAll();
  }

  @Get('history')
  getHistory() {
    return this.adminGoPricingService.getHistory();
  }

  @Get(':vehicleType')
  getOne(@Param('vehicleType') vehicleType: string) {
    return this.adminGoPricingService.getOne(vehicleType);
  }

  @Patch(':vehicleType')
  update(
    @Param('vehicleType') vehicleType: string,
    @CurrentUser() user: { userId?: string; email?: string },
    @Body() body: Record<string, unknown>,
  ) {
    const changedBy = user?.email ?? user?.userId ?? 'admin';
    return this.adminGoPricingService.update(vehicleType, body, changedBy);
  }

  @Post('surge')
  surge(@Body() body: { vehicleType: string; surgeActive: boolean; surgeMultiplier?: number }) {
    return this.adminGoPricingService.setSurge(
      body.vehicleType,
      body.surgeActive,
      body.surgeMultiplier,
    );
  }
}
