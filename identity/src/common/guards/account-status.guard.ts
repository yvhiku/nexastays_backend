import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthzVersionService } from '../../modules/auth/authz-version.service';
import {
  assertAccountNotRestricted,
  isRestrictedAccountStatus,
} from '../security/account-status';

/**
 * Gate 047: live account status for every authenticated request.
 * otp_session / identity_session tokens skip (pre-account flows).
 * Restricted: SUSPENDED, FROZEN, BANNED.
 */
@Injectable()
export class AccountStatusGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authzVersions: AuthzVersionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      user?: {
        userId?: string;
        type?: string;
      };
    }>();
    const user = request.user;
    if (!user?.userId) return true;
    if (user.type === 'otp_session' || user.type === 'identity_session') {
      return true;
    }

    const state = await this.authzVersions.getAuthzState(user.userId);
    if (state.status === 'UNKNOWN' && state.authz_version === -1) {
      throw new UnauthorizedException('Account access revoked');
    }
    assertAccountNotRestricted(state.status, { asUnauthorized: true });
    // Defense: if status somehow slips through, still honor restricted set.
    if (isRestrictedAccountStatus(state.status)) {
      throw new UnauthorizedException('Account access revoked');
    }
    return true;
  }
}
