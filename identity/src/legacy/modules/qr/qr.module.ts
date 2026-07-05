import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QrController } from './qr.controller';
import { QrService } from './qr.service';
import { QrPayment } from './entities/qr-payment.entity';
import { TransactionsModule } from '../transactions/transactions.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MoneyMovementIdempotencyModule } from '../../common/idempotency/money-movement-idempotency.module';
import { KycPolicyModule } from '../compliance/kyc-policy/kyc-policy.module';
import { KycMoneyMovementMiddleware } from '../compliance/kyc-policy/kyc-money-movement.middleware';

@Module({
  imports: [
    TypeOrmModule.forFeature([QrPayment]),
    TransactionsModule,
    UsersModule,
    NotificationsModule,
    MoneyMovementIdempotencyModule,
    KycPolicyModule,
  ],
  controllers: [QrController],
  providers: [QrService],
})
export class QrModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(KycMoneyMovementMiddleware)
      .forRoutes(
        { path: 'qr/pay', method: RequestMethod.POST },
        { path: 'pay/qr/pay', method: RequestMethod.POST },
      );
  }
}
