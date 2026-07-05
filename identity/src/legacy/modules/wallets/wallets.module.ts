import { Module, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { Wallet } from './entities/wallet.entity';
import { User } from '../users/entities/user.entity';
import { LedgerModule } from '../ledger/ledger.module';
import { AppTransaction } from '../transactions/entities/app-transaction.entity';
import { LedgerAccount } from '../ledger/entities/ledger-account.entity';
import { UsersModule } from '../users/users.module';
import { DatabaseModule } from '../../common/database/database.module';
import { CommonCacheModule } from '../../common/cache/cache.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EMIModule } from '../emi/emi.module';
import { MoneyMovementIdempotencyModule } from '../../common/idempotency/money-movement-idempotency.module';
import { KycPolicyModule } from '../compliance/kyc-policy/kyc-policy.module';
import { KycMoneyMovementMiddleware } from '../compliance/kyc-policy/kyc-money-movement.middleware';
import { SubscriptionLimitsModule } from '../subscription-limits/subscription-limits.module';

@Module({
  imports: [
    DatabaseModule,
    CommonCacheModule,
    NotificationsModule,
    TypeOrmModule.forFeature([Wallet, User, AppTransaction, LedgerAccount]),
    LedgerModule,
    UsersModule,
    EMIModule.register(),
    MoneyMovementIdempotencyModule,
    KycPolicyModule,
    SubscriptionLimitsModule,
  ],
  controllers: [WalletsController],
  providers: [WalletsService],
  exports: [WalletsService, TypeOrmModule],
})
export class WalletsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(KycMoneyMovementMiddleware)
      .forRoutes(
        { path: 'wallets/topup', method: RequestMethod.POST },
        { path: 'pay/wallets/topup', method: RequestMethod.POST },
        { path: 'wallets/withdraw', method: RequestMethod.POST },
        { path: 'pay/wallets/withdraw', method: RequestMethod.POST },
      );
  }
}
