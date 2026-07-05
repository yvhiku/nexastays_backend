import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NfcController } from './nfc.controller';
import { NfcService } from './nfc.service';
import { NfcToken } from './entities/nfc-token.entity';
import { TransactionsModule } from '../transactions/transactions.module';
import { UsersModule } from '../users/users.module';
import { MoneyMovementIdempotencyModule } from '../../common/idempotency/money-movement-idempotency.module';
import { KycPolicyModule } from '../compliance/kyc-policy/kyc-policy.module';
import { KycMoneyMovementMiddleware } from '../compliance/kyc-policy/kyc-money-movement.middleware';

@Module({
  imports: [
    TypeOrmModule.forFeature([NfcToken]),
    TransactionsModule,
    UsersModule,
    MoneyMovementIdempotencyModule,
    KycPolicyModule,
  ],
  controllers: [NfcController],
  providers: [NfcService],
})
export class NfcModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(KycMoneyMovementMiddleware)
      .forRoutes(
        { path: 'nfc/pay', method: RequestMethod.POST },
        { path: 'pay/nfc/pay', method: RequestMethod.POST },
      );
  }
}
