import { BadRequestException } from '@nestjs/common';
import {
  assertBalancedJournal,
  computeStableJournalPayloadHash,
} from './ledger-validation';

describe('assertBalancedJournal', () => {
  it('accepts a balanced two-line journal', () => {
    expect(() =>
      assertBalancedJournal([
        { accountId: 'a', entryType: 'DEBIT', amount: 50 },
        { accountId: 'b', entryType: 'CREDIT', amount: 50 },
      ]),
    ).not.toThrow();
  });

  it('rejects imbalance', () => {
    expect(() =>
      assertBalancedJournal([
        { accountId: 'a', entryType: 'DEBIT', amount: 50 },
        { accountId: 'b', entryType: 'CREDIT', amount: 49 },
      ]),
    ).toThrow(BadRequestException);
  });
});

describe('computeStableJournalPayloadHash', () => {
  it('matches regardless of input line ordering', () => {
    const a = [
      { accountId: 'x', entryType: 'DEBIT' as const, amount: 10 },
      { accountId: 'y', entryType: 'CREDIT' as const, amount: 10 },
    ];
    const b = [...a].reverse();
    expect(computeStableJournalPayloadHash(a)).toEqual(
      computeStableJournalPayloadHash(b),
    );
  });
});
