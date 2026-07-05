import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RidesController } from './rides.controller';
import { RidesService } from './rides.service';
import { DriversModule } from './drivers/drivers.module';
import { RegistrationApplicationsModule } from './registration-applications/registration-applications.module';
import { Ride } from './entities/ride.entity';
import { User } from '../users/entities/user.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { LedgerModule } from '../ledger/ledger.module';
import { WalletsModule } from '../wallets/wallets.module';
import { UsersModule } from '../users/users.module';
import { AccountTypeGuard } from '../../common/guards/account-type.guard';
import { AppTransaction } from '../transactions/entities/app-transaction.entity';
import { CommissionsModule } from './commissions/commissions.module';
import { CommonCacheModule } from '../../common/cache/cache.module';
import { FaresModule } from './fares/fares.module';
import { PricingModule } from './pricing/pricing.module';
import { CancellationService } from './rides/cancellation.service';

/**
 * Nexa Go Taxi: rides, drivers, matching, commissions, pricing, payouts.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Ride, User, Wallet, AppTransaction]),
    LedgerModule,
    WalletsModule,
    UsersModule,
    DriversModule,
    RegistrationApplicationsModule,
    CommissionsModule,
    CommonCacheModule,
    FaresModule,
    PricingModule,
  ],
  controllers: [RidesController],
  providers: [RidesService, AccountTypeGuard, CancellationService],
  exports: [RidesService, CancellationService],
})
export class GoTaxiModule {}
