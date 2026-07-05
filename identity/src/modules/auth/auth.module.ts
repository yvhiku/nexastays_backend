import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from '../users/entities/user.entity';
import { OtpCode } from './entities/otp-code.entity';
import { OtpSession } from './entities/otp-session.entity';
import { OtpAttempt } from './entities/otp-attempt.entity';
import { PinAttempt } from './entities/pin-attempt.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { TrustedDevice } from './entities/trusted-device.entity';
import { OtpLockoutService } from './otp-lockout.service';
import { PinLockoutService } from './pin-lockout.service';
import { OtpSendRateLimitService } from './otp-send-rate-limit.service';
import { OtpVerifyRateLimitService } from './otp-verify-rate-limit.service';
import { OtpSendRateLimitGuard } from './guards/otp-send-rate-limit.guard';
import { OtpVerifyRateLimitGuard } from './guards/otp-verify-rate-limit.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtKeysService } from '../jwks/jwt-keys.service';
import { appConfig } from '../../common/config/app.config';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { RiskAlert } from '../admin/entities/risk-alert.entity';
import { KycProfile } from '../compliance/entities/kyc-profile.entity';
import { RiskAuthMiddleware } from '../../common/middleware/risk_auth.middleware';
import { SecurityEventsModule } from '../security-events/security-events.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      OtpCode,
      OtpSession,
      OtpAttempt,
      PinAttempt,
      RefreshToken,
      TrustedDevice,
      AuditLog,
      RiskAlert,
      KycProfile,
    ]),
    PassportModule,
    JwtModule.registerAsync({
      inject: [JwtKeysService],
      useFactory: (keys: JwtKeysService) => ({
        privateKey: keys.privateKey,
        publicKey: keys.publicKey,
        signOptions: {
          algorithm: 'RS256',
          expiresIn: appConfig.jwtExpiresIn,
          keyid: keys.kid,
        } as any,
      }),
    }),
    UsersModule,
    AuditModule,
    SecurityEventsModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    OtpLockoutService,
    PinLockoutService,
    OtpSendRateLimitService,
    OtpVerifyRateLimitService,
    OtpSendRateLimitGuard,
    OtpVerifyRateLimitGuard,
  ],
  exports: [AuthService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RiskAuthMiddleware)
      .forRoutes(
        'auth/verify-pin',
        'auth/pin/verify',
        'pay/auth/verify-pin',
        'pay/auth/pin/verify',
      );
  }
}
