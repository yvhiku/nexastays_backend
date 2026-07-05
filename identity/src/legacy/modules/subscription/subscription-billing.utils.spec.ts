import {
  addMonthsPreservingAnchor,
  computeNextBillingAt,
  deriveAnchorDay,
} from './subscription-billing.utils';

describe('subscription billing utils', () => {
  it('derives anchor day from UTC date', () => {
    expect(deriveAnchorDay(new Date('2026-05-23T12:00:00Z'))).toBe(23);
  });

  it('monthly renewal keeps same day next month', () => {
    const start = new Date('2026-05-23T10:15:00Z');
    const next = computeNextBillingAt(start, 'monthly', 23);
    expect(next.getUTCFullYear()).toBe(2026);
    expect(next.getUTCMonth()).toBe(5);
    expect(next.getUTCDate()).toBe(23);
  });

  it('monthly renewal clamps to last day of shorter month', () => {
    const start = new Date('2026-01-31T10:00:00Z');
    const next = addMonthsPreservingAnchor(start, 31);
    expect(next.getUTCMonth()).toBe(1);
    expect(next.getUTCDate()).toBe(28);
  });

  it('yearly renewal adds one year', () => {
    const start = new Date('2026-05-23T10:00:00Z');
    const next = computeNextBillingAt(start, 'yearly', 23);
    expect(next.getUTCFullYear()).toBe(2027);
    expect(next.getUTCMonth()).toBe(4);
    expect(next.getUTCDate()).toBe(23);
  });
});
