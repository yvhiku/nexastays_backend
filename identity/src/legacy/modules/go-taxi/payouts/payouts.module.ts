import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayoutsService } from './payouts.service';
import { GoTransaction } from './entities/go-transaction.entity';
import { Ride } from '../rides/entities/ride.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { LedgerModule } from '../../ledger/ledger.module';
import { WalletsModule } from '../../wallets/wallets.module';
import { UsersModule } from '../../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GoTransaction, Ride, DriverProfile]),
    LedgerModule,
    WalletsModule,
    UsersModule,
  ],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
