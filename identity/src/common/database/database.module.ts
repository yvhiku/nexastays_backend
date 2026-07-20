import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from '../config/database.config';
import { DbHealthService } from './db-health.service';
import { DbCircuitBreakerGuard } from '../guards/db-circuit-breaker.guard';
import { User } from '../../modules/users/entities/user.entity';
import { UnifiedIdentity } from '../../modules/users/entities/unified-identity.entity';
import { IdentityPhoneNumber } from '../../modules/users/entities/identity-phone-number.entity';
import { ReusableIdentityVerification } from '../../modules/users/entities/reusable-identity-verification.entity';
import { IdempotencyKey } from '../../modules/users/entities/idempotency-key.entity';
import { UserConsent } from '../../modules/users/entities/user-consent.entity';
import { KycProfile } from '../../modules/compliance/entities/kyc-profile.entity';
import { TransactionLimit } from '../../modules/compliance/entities/transaction-limit.entity';
import { SarReport } from '../../modules/compliance/entities/sar-report.entity';
import { AuditLog } from '../../modules/audit/entities/audit-log.entity';
import { RiskAlert } from '../../modules/admin/entities/risk-alert.entity';
import { OtpCode } from '../../modules/auth/entities/otp-code.entity';
import { OtpSession } from '../../modules/auth/entities/otp-session.entity';
import { OtpAttempt } from '../../modules/auth/entities/otp-attempt.entity';
import { PinAttempt } from '../../modules/auth/entities/pin-attempt.entity';
import { RefreshToken } from '../../modules/auth/entities/refresh-token.entity';
import { TrustedDevice } from '../../modules/auth/entities/trusted-device.entity';
import { PushDeviceToken } from '../../modules/notifications/entities/push-device-token.entity';
import { UserNotification } from '../../modules/notifications/entities/user-notification.entity';
import { SecurityEvent } from '../../modules/security-events/entities/security-event.entity';
import { FraudEvent } from '../../modules/fraud/entities/fraud-event.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      ...databaseConfig,
      autoLoadEntities: false,
      entities: [
        User,
        UnifiedIdentity,
        IdentityPhoneNumber,
        ReusableIdentityVerification,
        IdempotencyKey,
        UserConsent,
        KycProfile,
        TransactionLimit,
        SarReport,
        AuditLog,
        RiskAlert,
        OtpCode,
        OtpSession,
        OtpAttempt,
        PinAttempt,
        RefreshToken,
        TrustedDevice,
        PushDeviceToken,
        UserNotification,
        SecurityEvent,
        FraudEvent,
      ],
    }),
  ],
  providers: [DbHealthService, DbCircuitBreakerGuard],
  exports: [TypeOrmModule, DbHealthService, DbCircuitBreakerGuard],
})
export class DatabaseModule {}
