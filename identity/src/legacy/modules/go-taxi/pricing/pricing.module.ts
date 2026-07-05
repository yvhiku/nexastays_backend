import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PricingService } from './pricing.service';
import { FareCalculatorService } from './fare-calculator.service';
import { PricingRule } from '../entities/pricing-rule.entity';
import { GoPricingConfig } from './entities/go-pricing-config.entity';
import { GoPricingConfigAudit } from './entities/go-pricing-config-audit.entity';
import { GoPricingService } from './go-pricing.service';
import { GoRideLedgerService } from './go-ride-ledger.service';
import { LedgerModule } from '../../ledger/ledger.module';
import { Wallet } from '../../wallets/entities/wallet.entity';
import { CommonCacheModule } from '../../../common/cache/cache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PricingRule, GoPricingConfig, GoPricingConfigAudit, Wallet]),
    LedgerModule,
    CommonCacheModule,
  ],
  providers: [PricingService, FareCalculatorService, GoPricingService, GoRideLedgerService],
  exports: [PricingService, FareCalculatorService, GoPricingService, GoRideLedgerService],
})
export class PricingModule {}
