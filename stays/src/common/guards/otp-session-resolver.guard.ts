import { Injectable, CanActivate } from '@nestjs/common';

/** Stays does not issue OTP sessions — Identity does. */
@Injectable()
export class OtpSessionResolverGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}
