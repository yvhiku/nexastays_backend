import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { DbCircuitBreakerGuard } from '../../../common/guards/db-circuit-breaker.guard';
import { AdminKycService } from '../services/admin-kyc.service';
import { AdminKycQueryDto } from '../dto/admin-kyc.query.dto';

@ApiTags('Pay Admin')
@Controller(['admin/kyc', 'pay/admin/kyc'])
@SkipThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminKycController {
  constructor(private readonly adminKycService: AdminKycService) {}

  @Get('applications')
  @SkipThrottle({ default: true })
  @UseGuards(DbCircuitBreakerGuard)
  getApplications(@Query() query: AdminKycQueryDto) {
    return this.adminKycService.getQueue(query);
  }

  /** DEV only: debug KYC profile for a user. Returns 404 in production. */
  @Get('debug/user/:userId')
  getDebugUser(@Param('userId') userId: string) {
    return this.adminKycService.getDebugUser(userId);
  }

  @Get(':id')
  getCase(@Param('id') id: string) {
    return this.adminKycService.getCase(id);
  }

}
