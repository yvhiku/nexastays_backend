import type { ProBillingPeriod } from './subscription.constants';

/** UTC day-of-month (1–31) from the first purchase / renewal anchor. */
export function deriveAnchorDay(date: Date): number {
  return date.getUTCDate();
}

/**
 * Next renewal instant: same calendar day each month (or last day of month if shorter),
 * or +1 year for yearly plans.
 */
export function computeNextBillingAt(
  from: Date,
  period: ProBillingPeriod,
  anchorDay: number,
): Date {
  if (period === 'yearly') {
    const d = new Date(from);
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    return d;
  }
  return addMonthsPreservingAnchor(from, anchorDay);
}

export function addMonthsPreservingAnchor(from: Date, anchorDay: number): Date {
  const d = new Date(from);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();
  const second = d.getUTCSeconds();
  const ms = d.getUTCMilliseconds();

  const targetMonthIndex = month + 1;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(
    Date.UTC(targetYear, normalizedMonth + 1, 0),
  ).getUTCDate();
  const day = Math.min(Math.max(anchorDay, 1), lastDay);

  return new Date(
    Date.UTC(targetYear, normalizedMonth, day, hour, minute, second, ms),
  );
}

/** Idempotency suffix for a renewal charge (YYYY-MM or YYYY for yearly). */
export function renewalIdempotencySuffix(
  nextBillingAt: Date,
  period: ProBillingPeriod,
): string {
  const y = nextBillingAt.getUTCFullYear();
  const m = String(nextBillingAt.getUTCMonth() + 1).padStart(2, '0');
  if (period === 'yearly') {
    return `${y}`;
  }
  return `${y}-${m}`;
}
