import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AdminEcosystemService } from '../services/admin-ecosystem.service';

@ApiTags('Pay Admin')
@Controller(['admin/ecosystem', 'pay/admin/ecosystem'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminEcosystemController {
  constructor(private readonly adminEcosystemService: AdminEcosystemService) {}

  @Get('stats')
  getEcosystemStats() {
    return this.adminEcosystemService.getEcosystemStats();
  }
}
