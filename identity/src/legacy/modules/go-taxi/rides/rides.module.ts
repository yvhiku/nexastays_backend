import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RidesService } from './rides.service';
import { RidesController } from './rides.controller';
import { Ride } from './entities/ride.entity';
import { RideEvent } from './entities/ride-event.entity';
import { PayoutsModule } from '../payouts/payouts.module';
import { PricingModule } from '../pricing/pricing.module';
import { MatchingModule } from '../matching/matching.module';
import { DriversModule } from '../drivers/drivers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ride, RideEvent]),
    PayoutsModule,
    PricingModule,
    MatchingModule,
    DriversModule,
  ],
  controllers: [RidesController],
  providers: [RidesService],
  exports: [RidesService, TypeOrmModule],
})
export class RidesModule {}
