import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthzVersionService } from '../../modules/auth/authz-version.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly authzVersions: AuthzVersionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const userRoles: string[] = Array.isArray(user?.roles)
      ? user.roles
      : user?.role
        ? [user.role]
        : user?.account_type === 'ADMIN'
          ? ['ADMIN']
          : [];

    const hasRole = requiredRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      throw new ForbiddenException(
        `Insufficient permissions. Required roles: ${requiredRoles.join(', ')}`,
      );
    }

    // SEC-003: ADMIN routes require live authz_version + status check (cached).
    if (requiredRoles.includes('ADMIN') || userRoles.includes('ADMIN')) {
      const state = await this.authzVersions.getAuthzState(user.userId);
      if (state.account_type !== 'ADMIN') {
        throw new ForbiddenException('Administrator privilege revoked');
      }
      if (state.status === 'FROZEN') {
        throw new ForbiddenException('Administrator privilege revoked');
      }
      const tokenVersion = Number(user.authz_version ?? user.av);
      if (
        !Number.isFinite(tokenVersion) ||
        tokenVersion !== state.authz_version
      ) {
        throw new ForbiddenException('Administrator privilege revoked');
      }
    }

    return true;
  }
}
