import { SetMetadata } from '@nestjs/common';
import type { AccountType } from '../types/account.types';

export const ACCOUNT_TYPES_KEY = 'accountTypes';

/**
 * Restrict route to specific account types.
 */
export const AccountTypes = (...types: AccountType[]) =>
  SetMetadata(ACCOUNT_TYPES_KEY, types);
