import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCOUNT_TYPES_KEY } from '../decorators/account-type.decorator';
import type { AccountType } from '../types/account.types';

@Injectable()
export class AccountTypeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AccountType[]>(
      ACCOUNT_TYPES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const accountType = request.user?.account_type as AccountType | undefined;
    if (!accountType || !required.includes(accountType)) {
      throw new ForbiddenException('Account type not allowed for this action');
    }
    return true;
  }
}
