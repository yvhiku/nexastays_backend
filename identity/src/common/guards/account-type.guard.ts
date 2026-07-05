import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCOUNT_TYPES_KEY } from '../decorators/account-type.decorator';
import type { AccountType } from '../../modules/users/entities/user.entity';
import { UsersService } from '../../modules/users/users.service';

@Injectable()
export class AccountTypeGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Optional() private usersService?: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const allowed = this.reflector.getAllAndOverride<AccountType[]>(
      ACCOUNT_TYPES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!allowed?.length) return true;

    const request = context.switchToHttp().getRequest();
    let accountType = request.user?.account_type as AccountType | undefined;
    let userId = request.user?.userId;

    // OTP/identity session tokens lack account_type - resolve to real user when UsersService is available
    if (
      !accountType &&
      (request.user?.type === 'otp_session' || request.user?.type === 'identity_session') &&
      request.user?.phone_number &&
      this.usersService
    ) {
      const body = request.body || {};
      const resolvedUser = await this.usersService.findOrCreateForKyc(
        request.user.phone_number,
        body.full_name,
        body.nationality,
      );
      userId = resolvedUser.id;
      accountType = 'CONSUMER';
      request.user = {
        ...request.user,
        userId,
        account_type: accountType,
      };
    }

    if (!userId) {
      throw new ForbiddenException('User not authenticated');
    }
    if (!accountType) {
      throw new ForbiddenException('JWT missing account_type');
    }
    if (!allowed.includes(accountType)) {
      throw new ForbiddenException(
        `This endpoint requires account type: ${allowed.join(' or ')}. Your account is ${accountType}.`,
      );
    }
    return true;
  }
}
