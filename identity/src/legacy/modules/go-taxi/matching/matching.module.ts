import { Module } from '@nestjs/common';
import { MatchingService } from './matching.service';
import { DriversModule } from '../drivers/drivers.module';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [DriversModule, PricingModule],
  providers: [MatchingService],
  exports: [MatchingService],
})
export class MatchingModule {}
