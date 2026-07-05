import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AdminKycPolicyService } from '../services/admin-kyc-policy.service';
import { CreateKycAdminOverrideDto } from '../dto/create-kyc-admin-override.dto';

@ApiTags('Pay Admin')
@Controller(['admin/kyc/policy', 'pay/admin/kyc/policy'])
@SkipThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminKycPolicyController {
  constructor(private readonly adminKycPolicy: AdminKycPolicyService) {}

  @Get('tiers')
  listTiers() {
    return this.adminKycPolicy.listTierPolicies();
  }

  /** For scheduled compliance jobs / dashboards: effective vs pending bypass_all_limits. */
  @Get('reports/bypass-limits')
  bypassReport() {
    return this.adminKycPolicy.bypassLimitsComplianceReport();
  }

  @Get('overrides')
  listOverrides(@Query('user_id') userId: string) {
    return this.adminKycPolicy.listOverridesForUser(userId);
  }

  @Post('overrides')
  createOverride(
    @Body() body: CreateKycAdminOverrideDto,
    @CurrentUser() admin: { userId: string; roles?: string[]; role?: string },
  ) {
    return this.adminKycPolicy.createOverride(body, admin);
  }

  @Patch('overrides/:id/approve-bypass-limits')
  approveBypass(
    @Param('id') id: string,
    @CurrentUser() admin: { userId: string; roles?: string[]; role?: string },
  ) {
    return this.adminKycPolicy.approveBypassLimits(id, admin);
  }

  @Patch('overrides/:id/deactivate')
  deactivate(
    @Param('id') id: string,
    @CurrentUser() admin: { userId: string },
  ) {
    return this.adminKycPolicy.deactivateOverride(id, admin.userId);
  }
}
