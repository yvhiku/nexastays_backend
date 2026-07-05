import { Module, RequestMethod } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { appConfig } from '../../../common/config/app.config';
import { User } from '../../users/entities/user.entity';
import { KycProfile } from '../entities/kyc-profile.entity';
import { TransactionLimit } from '../entities/transaction-limit.entity';
import { AuditModule } from '../../audit/audit.module';
import { KycTierPolicy } from './entities/kyc-tier-policy.entity';
import { KycAdminOverride } from './entities/kyc-admin-override.entity';
import { KycPolicyConfigService } from './kyc-policy-config.service';
import { KycPolicyValidationService } from './kyc-policy-validation.service';
import { KycMoneyMovementMiddleware } from './kyc-money-movement.middleware';
import { KycMoneyMovementCoarseGuard } from './kyc-money-movement.guard';
import { KycTierPolicySeedService } from './kyc-tier-policy-seed.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KycTierPolicy,
      KycAdminOverride,
      TransactionLimit,
      User,
      KycProfile,
    ]),
    AuditModule,
    JwtModule.register({
      secret: appConfig.jwtSecret,
      signOptions: { expiresIn: appConfig.jwtExpiresIn as any },
    }),
  ],
  providers: [
    KycPolicyConfigService,
    KycPolicyValidationService,
    KycTierPolicySeedService,
    KycMoneyMovementMiddleware,
    KycMoneyMovementCoarseGuard,
  ],
  exports: [
    JwtModule,
    KycPolicyConfigService,
    KycPolicyValidationService,
    KycMoneyMovementMiddleware,
    KycMoneyMovementCoarseGuard,
    TypeOrmModule,
  ],
})
export class KycPolicyModule {
  /** Route paths are controller-relative (Nest strips global prefix for matching). */
  static readonly moneyMovementMiddlewareRoutes = [
    { path: 'transfers/send', method: RequestMethod.POST },
    { path: 'pay/transfers/send', method: RequestMethod.POST },
    { path: 'wallets/topup', method: RequestMethod.POST },
    { path: 'pay/wallets/topup', method: RequestMethod.POST },
    { path: 'wallets/withdraw', method: RequestMethod.POST },
    { path: 'pay/wallets/withdraw', method: RequestMethod.POST },
    { path: 'qr/pay', method: RequestMethod.POST },
    { path: 'pay/qr/pay', method: RequestMethod.POST },
    { path: 'nfc/pay', method: RequestMethod.POST },
    { path: 'pay/nfc/pay', method: RequestMethod.POST },
  ];
}
