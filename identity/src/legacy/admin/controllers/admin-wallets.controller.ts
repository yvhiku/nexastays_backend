import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AdminWalletsService } from '../services/admin-wallets.service';
import { AdminWalletsQueryDto } from '../dto/admin-wallets.query.dto';

@ApiTags('Pay Admin')
@Controller(['admin/wallets', 'pay/admin/wallets'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminWalletsController {
  constructor(private readonly adminWalletsService: AdminWalletsService) {}

  @Get()
  getWallets(@Query() query: AdminWalletsQueryDto) {
    return this.adminWalletsService.getWallets(query);
  }

  @Get(':id')
  getWallet(@Param('id') id: string) {
    return this.adminWalletsService.getWallet(id);
  }

  @Get(':id/ledger')
  getWalletLedger(@Param('id') id: string) {
    return this.adminWalletsService.getWalletLedger(id);
  }
}
