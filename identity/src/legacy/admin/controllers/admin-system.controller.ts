import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AccountTypeGuard } from '../../../common/guards/account-type.guard';
import { AccountTypes } from '../../../common/decorators/account-type.decorator';
import { LedgerService } from '../../ledger/ledger.service';
import { AdminSystemFeatureFlagsService } from '../services/admin-system-feature-flags.service';
import { AdminPayConfigService } from '../services/admin-pay-config.service';
import { UpdateFeatureFlagDto } from '../dto/update-feature-flag.dto';

@ApiTags('Pay Admin')
@Controller(['admin/system', 'pay/admin/system'])
@UseGuards(JwtAuthGuard, AccountTypeGuard)
@AccountTypes('ADMIN')
export class AdminSystemController {
  constructor(
    private readonly ledgerService: LedgerService,
    private readonly featureFlagsService: AdminSystemFeatureFlagsService,
    private readonly payConfigService: AdminPayConfigService,
  ) {}

  @Get('accounts')
  async getSystemAccounts() {
    const accounts = await this.ledgerService.getSystemAccounts();
    return accounts.map((account) => ({
      id: account.id,
      account_type: account.account_type,
      balance: null,
    }));
  }

  @Get('feature-flags')
  async getFeatureFlags() {
    return this.featureFlagsService.getAll();
  }

  @Patch('feature-flags/:key')
  async updateFeatureFlag(
    @Param('key') key: string,
    @Body() body: UpdateFeatureFlagDto,
  ) {
    return this.featureFlagsService.update(key, body.enabled);
  }

  @Get('pay-config')
  getPayConfig() {
    return this.payConfigService.getPayConfig();
  }

  @Patch('pay-config')
  updatePayConfig(
    @Body() body: { dailyLimitUnverified?: number; dailyLimitKyc?: number; qrExpirySeconds?: number },
  ) {
    return this.payConfigService.updatePayConfig(body);
  }
}
