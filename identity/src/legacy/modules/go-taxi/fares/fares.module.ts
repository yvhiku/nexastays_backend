import { Module } from '@nestjs/common';
import { FaresController } from './fares.controller';
import { FaresService } from './fares.service';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [PricingModule],
  controllers: [FaresController],
  providers: [FaresService],
  exports: [FaresService],
})
export class FaresModule {}
