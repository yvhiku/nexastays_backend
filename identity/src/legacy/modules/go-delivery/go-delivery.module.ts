import { Module } from '@nestjs/common';
import { MerchantsModule } from './merchants/merchants.module';
import { MenusModule } from './menus/menus.module';
import { OrdersModule } from './orders/orders.module';
import { CouriersModule } from './couriers/couriers.module';
import { PricingModule } from './pricing/pricing.module';
import { PayoutsModule } from './payouts/payouts.module';
import { RestaurantsModule } from './restaurants/restaurants.module';

@Module({
  imports: [
    MerchantsModule,
    MenusModule,
    OrdersModule,
    CouriersModule,
    PricingModule,
    PayoutsModule,
    RestaurantsModule,
  ],
  exports: [
    MerchantsModule,
    MenusModule,
    OrdersModule,
    CouriersModule,
    PricingModule,
    PayoutsModule,
  ],
})
export class GoDeliveryModule {}
