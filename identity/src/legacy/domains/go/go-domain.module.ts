import { Module } from '@nestjs/common';
import { GoTaxiModule } from '../../modules/go-taxi/go-taxi.module';
import { GoDeliveryModule } from '../../modules/go-delivery/go-delivery.module';

/**
 * Nexa Go domain: taxi + delivery.
 * - Go Taxi: rides, drivers, matching, commissions
 * - Go Delivery: merchants, orders, couriers, restaurants
 */
@Module({
  imports: [GoTaxiModule, GoDeliveryModule],
  exports: [GoTaxiModule, GoDeliveryModule],
})
export class GoDomainModule {}
