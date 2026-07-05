import { SetMetadata } from '@nestjs/common';
import type { AccountType } from '../../modules/users/entities/user.entity';

export const ACCOUNT_TYPES_KEY = 'account_types';

/**
 * Restrict route to specific account types (e.g. DRIVER, COURIER).
 * Use on Nexa Go routes; CONSUMER is rejected when only DRIVER/COURIER allowed.
 */
export const AccountTypes = (...types: AccountType[]) =>
  SetMetadata(ACCOUNT_TYPES_KEY, types);
