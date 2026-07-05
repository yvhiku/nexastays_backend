import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionLimitsService } from './subscription-limits.service';
import { User } from '../users/entities/user.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { LedgerEntry } from '../ledger/entities/ledger-entry.entity';
import { AppTransaction } from '../transactions/entities/app-transaction.entity';
import { LedgerModule } from '../ledger/ledger.module';
import { RewardsProgramModule } from '../rewards-program/rewards-program.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Wallet, LedgerEntry, AppTransaction]),
    LedgerModule,
    RewardsProgramModule,
  ],
  providers: [SubscriptionLimitsService],
  exports: [SubscriptionLimitsService],
})
export class SubscriptionLimitsModule {}
