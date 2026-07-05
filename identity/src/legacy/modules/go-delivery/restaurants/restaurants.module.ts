import { Module } from '@nestjs/common';
import { RestaurantsController } from './restaurants.controller';
import { MerchantsModule } from '../merchants/merchants.module';
import { MenusModule } from '../menus/menus.module';

@Module({
  imports: [MerchantsModule, MenusModule],
  controllers: [RestaurantsController],
})
export class RestaurantsModule {}
