import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { DeliveryEvent } from './entities/delivery-event.entity';
import { PricingModule } from '../pricing/pricing.module';
import { MerchantsModule } from '../merchants/merchants.module';
import { MenusModule } from '../menus/menus.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { CouriersModule } from '../couriers/couriers.module';
import { CommissionsModule } from '../../go-taxi/commissions/commissions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, DeliveryEvent]),
    PricingModule,
    MerchantsModule,
    MenusModule,
    CouriersModule,
    PayoutsModule,
    CommissionsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService, TypeOrmModule],
})
export class OrdersModule {}
