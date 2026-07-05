/**
 * Chart of accounts for Nexa Pay (MAD custodial wallets).
 *
 * Conventions:
 * - Customer-facing balances live on CUSTOMER_LIABILITY (credit-normal).
 * - SAFEGUARDING_MIRROR is debit-normal — represents mirrored custody / segregation against external funds (simplified asset mirror).
 * - FEES is credit-normal revenue (P2P/QR/NFC commissions, Go ride/delivery platform fees).
 * - COMPANY_REVENUE is credit-normal revenue (Nexa Pro subscriptions and other direct platform income).
 * - SUSPENSE and REVERSALS are operational clears; allow_negative guards off-balance bridging while ops resolve.
 */

export enum LedgerNormalBalance {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

/** Linked to wallets.id — every spendable MAD balance is ledger-derived here. */
export const CUSTOMER_LIABILITY_ACCOUNT_TYPE = 'CUSTOMER_LIABILITY' as const;

/** System (non-wallet) control accounts for double-entry integrity. */
export const PAY_SYSTEM_LEDGER_ACCOUNT_TYPES = [
  'SAFEGUARDING_MIRROR',
  'FEES',
  'COMPANY_REVENUE',
  'REVERSALS',
  'SUSPENSE',
  'REWARDS_LIABILITY',
] as const;

export type PaySystemLedgerAccountType =
  (typeof PAY_SYSTEM_LEDGER_ACCOUNT_TYPES)[number];

export enum LedgerSystemAccountType {
  SAFEGUARDING_MIRROR = 'SAFEGUARDING_MIRROR',
  FEES = 'FEES',
  /** Nexa company revenue (subscriptions, direct platform sales) — separate from transfer fees. */
  COMPANY_REVENUE = 'COMPANY_REVENUE',
  REVERSALS = 'REVERSALS',
  SUSPENSE = 'SUSPENSE',
  REWARDS_LIABILITY = 'REWARDS_LIABILITY',
}
