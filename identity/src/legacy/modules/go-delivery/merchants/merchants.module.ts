import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchantsService } from './merchants.service';
import { MerchantsController } from './merchants.controller';
import { Merchant } from './entities/merchant.entity';
import { UsersModule } from '../../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([Merchant]), UsersModule],
  controllers: [MerchantsController],
  providers: [MerchantsService],
  exports: [MerchantsService, TypeOrmModule],
})
export class MerchantsModule {}
