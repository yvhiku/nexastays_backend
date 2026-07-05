import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayoutsService } from './payouts.service';
import { DeliveryTransaction } from './entities/delivery-transaction.entity';
import { Order } from '../orders/entities/order.entity';
import { AppTransaction } from '../../transactions/entities/app-transaction.entity';
import { LedgerModule } from '../../ledger/ledger.module';
import { CommissionsModule } from '../../go-taxi/commissions/commissions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeliveryTransaction, Order, AppTransaction]),
    LedgerModule,
    CommissionsModule,
  ],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
