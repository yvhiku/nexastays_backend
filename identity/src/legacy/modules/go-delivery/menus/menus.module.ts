import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenusService } from './menus.service';
import { MenusController } from './menus.controller';
import { Menu } from './entities/menu.entity';
import { MenuItem } from './entities/menu-item.entity';
import { MerchantsModule } from '../merchants/merchants.module';

@Module({
  imports: [TypeOrmModule.forFeature([Menu, MenuItem]), MerchantsModule],
  controllers: [MenusController],
  providers: [MenusService],
  exports: [MenusService, TypeOrmModule],
})
export class MenusModule {}
