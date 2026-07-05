import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { UnifiedIdentity } from './entities/unified-identity.entity';
import { IdentityPhoneNumber } from './entities/identity-phone-number.entity';
import { ReusableIdentityVerification } from './entities/reusable-identity-verification.entity';
import { IdempotencyKey } from './entities/idempotency-key.entity';
import { KycProfile } from '../compliance/entities/kyc-profile.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { OtpSession } from '../auth/entities/otp-session.entity';
import { OtpCode } from '../auth/entities/otp-code.entity';
import { OtpAttempt } from '../auth/entities/otp-attempt.entity';
import { TrustedDevice } from '../auth/entities/trusted-device.entity';
import { AccountTypeGuard } from '../../common/guards/account-type.guard';
import { OtpSessionResolverGuard } from '../../common/guards/otp-session-resolver.guard';
import { DatabaseModule } from '../../common/database/database.module';
import { CommonCacheModule } from '../../common/cache/cache.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';
import { UserConsent } from './entities/user-consent.entity';
import { UnifiedIdentityService } from './unified-identity.service';
import { KycReuseService } from './kyc-reuse.service';
import { ProfileSyncService } from './profile-sync.service';
import { IdentityPhoneNumbersService } from './identity-phone-numbers.service';

@Module({
  imports: [
    DatabaseModule,
    CommonCacheModule,
    NotificationsModule,
    AuditModule,
    TypeOrmModule.forFeature([
      User,
      UnifiedIdentity,
      IdentityPhoneNumber,
      ReusableIdentityVerification,
      IdempotencyKey,
      KycProfile,
      AuditLog,
      RefreshToken,
      OtpSession,
      OtpCode,
      OtpAttempt,
      TrustedDevice,
      UserConsent,
    ]),
  ],
  controllers: [UsersController],
  providers: [
    IdentityPhoneNumbersService,
    UsersService,
    UnifiedIdentityService,
    KycReuseService,
    ProfileSyncService,
    AccountTypeGuard,
    OtpSessionResolverGuard,
  ],
  exports: [
    IdentityPhoneNumbersService,
    UsersService,
    UnifiedIdentityService,
    KycReuseService,
    ProfileSyncService,
    TypeOrmModule,
    AccountTypeGuard,
    OtpSessionResolverGuard,
  ],
})
export class UsersModule {}
