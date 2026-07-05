import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../../modules/users/users.service';

/**
 * Resolves OTP session tokens to real user IDs for registration flow.
 * When request.user has type 'otp_session' or 'identity_session':
 * - KYC routes (submit, upload): creates user if not exists.
 * - Consent routes: ensures CONSUMER user exists (same as post-OTP shell) so consents can persist.
 * - Other routes: only finds existing user; fails if none (except GET /users/me → pendingRegistration).
 */
@Injectable()
export class OtpSessionResolverGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.type || (user.type !== 'otp_session' && user.type !== 'identity_session')) {
      return true;
    }

    const path = (request.url || request.path || '').split('?')[0];
    const isKycRoute =
      path.includes('/kyc/submit') ||
      path.includes('/kyc/upload/document') ||
      path.includes('/kyc/upload/selfie') ||
      path.includes('/kyc/sumsub/token') ||
      path.includes('/kyc/sumsub/access-token');
    const isGetMe = path.includes('/users/me') && path.endsWith('/me');
    // Consent APIs need a real user row for user_consents. Match verifyOtp behaviour:
    // create CONSUMER shell if missing (same as findOrCreateForKyc used after OTP).
    const isConsentRoute =
      path.includes('/me/consents/current') ||
      path.includes('/me/consents/accept-mandatory') ||
      path.includes('/me/consents/marketing');

    const phoneNumber = user.phone_number as string | undefined;
    if (!phoneNumber?.trim()) {
      if (isConsentRoute || isKycRoute) {
        throw new UnauthorizedException(
          'Phone number missing from session token; obtain a new OTP session.',
        );
      }
      return true;
    }

    const body = request.body || {};
    const fullName = body.full_name as string | undefined;
    const nationality = body.nationality as string | undefined;

    const resolvedUser = isKycRoute
        ? await this.usersService.findOrCreateForKyc(
            phoneNumber,
            fullName,
            nationality,
          )
        : isConsentRoute
            ? (await this.usersService.findForKyc(phoneNumber)) ??
                (await this.usersService.findOrCreateForKyc(phoneNumber))
            : await this.usersService.findForKyc(phoneNumber);

    if (!resolvedUser) {
      if (isGetMe) {
        request.user = {
          ...user,
          userId: '',
          account_type: 'CONSUMER',
          pendingRegistration: true,
        };
        return true;
      }
      throw new NotFoundException(
        'Complete KYC first to create your account',
      );
    }

    request.user = {
      ...user,
      userId: resolvedUser.id,
      account_type: 'CONSUMER',
    };

    return true;
  }
}
