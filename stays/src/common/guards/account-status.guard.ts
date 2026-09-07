import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IdentityAuthzClient } from '../identity/identity-authz.client';
import { assertAccountNotRestricted } from '../security/account-status';

/**
 * Gate 047: live Identity account status on Stays authenticated routes.
 */
@Injectable()
export class AccountStatusGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authzClient: IdentityAuthzClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      user?: { userId?: string };
    }>();
    const userId = request.user?.userId;
    if (!userId) return true;

    const state = await this.authzClient.getAuthzState(userId);
    if (state.status === 'UNKNOWN' && state.authz_version === -1) {
      throw new UnauthorizedException('Account access revoked');
    }
    assertAccountNotRestricted(state.status);
    return true;
  }
}
