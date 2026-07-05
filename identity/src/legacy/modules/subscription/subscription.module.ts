import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { SubscriptionBillingCronService } from './subscription-billing.cron.service';
import { UserProSubscription } from './entities/user-pro-subscription.entity';
import { User } from '../users/entities/user.entity';
import { LedgerModule } from '../ledger/ledger.module';
import { WalletsModule } from '../wallets/wallets.module';
import { UsersModule } from '../users/users.module';
import { MoneyMovementIdempotencyModule } from '../../common/idempotency/money-movement-idempotency.module';
import { KycPolicyModule } from '../compliance/kyc-policy/kyc-policy.module';
import { DatabaseModule } from '../../common/database/database.module';
import { KycMoneyMovementMiddleware } from '../compliance/kyc-policy/kyc-money-movement.middleware';

@Module({
  imports: [
    DatabaseModule,
    TypeOrmModule.forFeature([User, UserProSubscription]),
    LedgerModule,
    WalletsModule,
    UsersModule,
    MoneyMovementIdempotencyModule,
    KycPolicyModule,
  ],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, SubscriptionBillingCronService],
  exports: [SubscriptionService],
})
export class SubscriptionModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(KycMoneyMovementMiddleware).forRoutes(
      { path: 'subscription/pro/purchase', method: RequestMethod.POST },
      { path: 'pay/subscription/pro/purchase', method: RequestMethod.POST },
    );
  }
}
