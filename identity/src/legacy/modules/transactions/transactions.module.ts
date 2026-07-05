import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionsController } from './transactions.controller';
import { TransfersController } from './transfers.controller';
import { RecipientsController } from './recipients.controller';
import { RecipientsService } from './recipients.service';
import { TransactionsService } from './transactions.service';
import { AppTransaction } from './entities/app-transaction.entity';
import { TransactionFee } from './entities/transaction-fee.entity';
import { User } from '../users/entities/user.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { LedgerAccount } from '../ledger/entities/ledger-account.entity';
import { LedgerTransaction } from '../ledger/entities/ledger-transaction.entity';
import { MoneyMovementIdempotencyModule } from '../../common/idempotency/money-movement-idempotency.module';
import { LedgerModule } from '../ledger/ledger.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FraudModule } from '../fraud/fraud.module';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { RiskAlert } from '../admin/entities/risk-alert.entity';
import { RiskAuthMiddleware } from '../../common/middleware/risk_auth.middleware';
import { AuditModule } from '../audit/audit.module';
import { SecurityEventsModule } from '../security-events/security-events.module';
import { EMIModule } from '../emi/emi.module';
import { RewardsProgramModule } from '../rewards-program/rewards-program.module';
import { KycPolicyModule } from '../compliance/kyc-policy/kyc-policy.module';
import { KycMoneyMovementMiddleware } from '../compliance/kyc-policy/kyc-money-movement.middleware';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AppTransaction,
      TransactionFee,
      User,
      Wallet,
      LedgerAccount,
      LedgerTransaction,
      AuditLog,
      RiskAlert,
    ]),
    MoneyMovementIdempotencyModule,
    LedgerModule,
    UsersModule,
    NotificationsModule,
    FraudModule,
    AuditModule,
    SecurityEventsModule,
    RewardsProgramModule,
    EMIModule.register(),
    KycPolicyModule,
  ],
  controllers: [TransactionsController, TransfersController, RecipientsController],
  providers: [TransactionsService, RecipientsService],
  exports: [TransactionsService, TypeOrmModule],
})
export class TransactionsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RiskAuthMiddleware)
      .forRoutes(
        'transfers/send',
        'pay/transfers/send',
        'transactions/transfer',
        'pay/transactions/transfer',
      );
    consumer
      .apply(KycMoneyMovementMiddleware)
      .forRoutes(
        { path: 'transfers/send', method: RequestMethod.POST },
        { path: 'pay/transfers/send', method: RequestMethod.POST },
      );
  }
}
