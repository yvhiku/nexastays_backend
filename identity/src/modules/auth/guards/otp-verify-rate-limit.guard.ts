import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { OtpVerifyRateLimitService } from '../otp-verify-rate-limit.service';

@Injectable()
export class OtpVerifyRateLimitGuard implements CanActivate {
  constructor(private readonly otpVerifyRateLimit: OtpVerifyRateLimitService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const phone = request.body?.phone_number;
    const ip =
      request.ip ||
      request.connection?.remoteAddress ||
      request.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
      '0.0.0.0';
    if (!phone || typeof phone !== 'string') {
      return true;
    }
    const allowed = this.otpVerifyRateLimit.checkAndIncrement(
      phone.trim(),
      String(ip).trim(),
    );
    if (!allowed) {
      throw new HttpException(
        'Too many attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
