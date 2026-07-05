/**
 * Role categories for branching logic between person-based and business-based roles.
 * See docs/merchant-business-entity-evolution.md for evolution path.
 *
 * - PERSON_ROLES: Individual human identities (profile = person data)
 * - BUSINESS_ROLES: Currently MERCHANT only; modeled as person today but may evolve
 *   to MerchantOrganization with operators/branches
 */
import type { AccountType } from './entities/user.entity';

/** Roles that represent an individual person; profile fields (full_name, date_of_birth) apply directly. */
export const PERSON_ROLES: readonly AccountType[] = [
  'CONSUMER',
  'DRIVER',
  'COURIER',
  'HOST',
] as const;

/**
 * Roles that may represent or operate a business entity.
 * Today MERCHANT is person-scoped (one User = one operator); future: MerchantOrganization + operators.
 */
export const BUSINESS_CAPABLE_ROLES: readonly AccountType[] = ['MERCHANT'] as const;

export function isPersonRole(accountType: string | null | undefined): boolean {
  return (
    (accountType ?? '').length > 0 &&
    (PERSON_ROLES as readonly string[]).includes((accountType ?? '').toUpperCase())
  );
}

/**
 * Roles that typically need linked_user → CONSUMER for payouts.
 * MERCHANT excluded: operator may not need consumer link; business entity may have different payout model.
 */
export function roleUsesConsumerForPayout(accountType: string | null | undefined): boolean {
  return ['DRIVER', 'COURIER', 'HOST'].includes((accountType ?? '').toUpperCase());
}
