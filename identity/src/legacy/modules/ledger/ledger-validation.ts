import { createHash } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { LedgerNormalBalance } from './ledger-chart.constants';

/** Matches `ledger_entries.entry_type` / `EntryType` enum string values. */
export type LedgerEntrySide = 'DEBIT' | 'CREDIT';

export interface JournalLineInput {
  readonly accountId: string;
  readonly entryType: LedgerEntrySide;
  /** Strictly positive amount in MAD (same scale as DB numeric(18,2)). */
  readonly amount: number;
}

/** Sum debits vs credits; both must agree within epsilon. */
const EPSILON = 0.000_001;

/**
 * Canonical hash of journal inputs for ledger idempotency replay validation.
 * Sorts by (account_id, entry_type, amount); amounts rounded to MAD cents.
 */
export function computeStableJournalPayloadHash(
  lines: JournalLineInput[],
): string {
  const normalized = [...lines]
    .map((l) => ({
      accountId: l.accountId,
      entryType: l.entryType,
      amount: Number(Number(l.amount).toFixed(2)),
    }))
    .sort((a, b) => {
      const cmpId = a.accountId.localeCompare(b.accountId);
      if (cmpId !== 0) return cmpId;
      const cmpType = a.entryType.localeCompare(b.entryType);
      if (cmpType !== 0) return cmpType;
      return a.amount - b.amount;
    });
  return createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex');
}

export function assertBalancedJournal(lines: JournalLineInput[]): void {
  if (!lines.length) {
    throw new BadRequestException('Ledger journal requires at least one line');
  }
  let debit = 0;
  let credit = 0;
  for (const line of lines) {
    if (!(line.amount > 0) || line.amount !== line.amount /* NaN */) {
      throw new BadRequestException('Each journal line requires amount > 0');
    }
    if (line.entryType === 'DEBIT') {
      debit += line.amount;
    } else if (line.entryType === 'CREDIT') {
      credit += line.amount;
    } else {
      throw new BadRequestException('Unknown entry_type on journal line');
    }
  }
  if (Math.abs(debit - credit) > EPSILON) {
    throw new BadRequestException(
      `Journal is not balanced: debits=${debit.toFixed(2)} credits=${credit.toFixed(2)}`,
    );
  }
}

export function signedBalanceFromPostingConvention(
  normalBalance: LedgerNormalBalance,
  creditMinusDebit: number,
  debitMinusCredit: number,
): number {
  return normalBalance === LedgerNormalBalance.DEBIT
    ? debitMinusCredit
    : creditMinusDebit;
}
