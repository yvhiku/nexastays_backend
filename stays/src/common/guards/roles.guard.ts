import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IdentityAuthzClient } from '../identity/identity-authz.client';

function jwtRoles(user: {
  roles?: string[];
  role?: string;
}): string[] {
  if (Array.isArray(user?.roles) && user.roles.length > 0) {
    return user.roles.map(String);
  }
  if (user?.role) return [String(user.role)];
  return [];
}

function isStaffRole(role: string): boolean {
  return role === 'ADMIN' || role === 'SUPPORT_AGENT';
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly authzClient: IdentityAuthzClient,
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

    const userRoles = jwtRoles(user);
    const hasRole = requiredRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      throw new ForbiddenException(
        `Insufficient permissions. Required roles: ${requiredRoles.join(', ')}`,
      );
    }

    const staffContext =
      requiredRoles.some(isStaffRole) || userRoles.some(isStaffRole);
    if (staffContext) {
      const state = await this.authzClient.getAuthzState(user.userId);
      if (state.account_type !== 'ADMIN' || state.status === 'FROZEN') {
        throw new ForbiddenException('Administrator privilege revoked');
      }
      const tokenVersion = Number(user.authz_version ?? user.av);
      if (
        !Number.isFinite(tokenVersion) ||
        tokenVersion !== state.authz_version
      ) {
        throw new ForbiddenException('Administrator privilege revoked');
      }
      if (
        state.staff_role &&
        isStaffRole(state.staff_role) &&
        !userRoles.includes(state.staff_role)
      ) {
        throw new ForbiddenException('Administrator privilege revoked');
      }
    }

    return true;
  }
}
