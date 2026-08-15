const DAY_MS = 24 * 60 * 60 * 1000;

function envNumber(name: string, fallback: number, min?: number): number {
  const n = Number(process.env[name]);
  if (!Number.isFinite(n)) return fallback;
  if (min != null && n < min) return fallback;
  return n;
}

export function supportQualityWindowDays(): number {
  return Math.min(90, Math.max(1, envNumber('SUPPORT_QUALITY_WINDOW_DAYS', 30, 1)));
}

export function supportMinReviewsForQualitySignal(): number {
  return Math.max(1, envNumber('SUPPORT_MIN_REVIEWS_FOR_QUALITY_SIGNAL', 5, 1));
}

export function supportLowAgentRatingThreshold(): number {
  return envNumber('SUPPORT_LOW_AGENT_RATING_THRESHOLD', 3.5, 0);
}

export function supportLowAgentRatingHighSeverity(): number {
  return envNumber('SUPPORT_LOW_AGENT_RATING_HIGH_SEVERITY', 2.5, 0);
}

export function supportMinSolvedRate(): number {
  return envNumber('SUPPORT_MIN_SOLVED_RATE', 0.7, 0);
}

export function supportMinTicketsForSlaSignal(): number {
  return Math.max(1, envNumber('SUPPORT_MIN_TICKETS_FOR_SLA_SIGNAL', 10, 1));
}

export function supportSlaRecentDays(): number {
  return Math.max(1, envNumber('SUPPORT_SLA_RECENT_DAYS', 7, 1));
}

export function supportSlaBaselineDays(): number {
  return Math.max(1, envNumber('SUPPORT_SLA_BASELINE_DAYS', 30, 1));
}

export function supportSlaDeclinePoints(): number {
  return envNumber('SUPPORT_SLA_DECLINE_POINTS', 0.2, 0);
}

export function supportSlaAbsoluteTarget(): number {
  return envNumber('SUPPORT_SLA_ABSOLUTE_TARGET', 0.8, 0);
}

export function supportReopenMaturityDays(): number {
  return Math.max(0, envNumber('SUPPORT_REOPEN_MATURITY_DAYS', 7, 0));
}

export function supportMinReviewsForCategorySignal(): number {
  return Math.max(1, envNumber('SUPPORT_MIN_REVIEWS_FOR_CATEGORY_SIGNAL', 5, 1));
}

export function supportCategoryRecentDays(): number {
  return Math.max(1, envNumber('SUPPORT_CATEGORY_RECENT_DAYS', 30, 1));
}

export function supportCategoryBaselineDays(): number {
  return Math.max(1, envNumber('SUPPORT_CATEGORY_BASELINE_DAYS', 30, 1));
}

export function supportCategoryDeclinePoints(): number {
  return envNumber('SUPPORT_CATEGORY_DECLINE_POINTS', 0.2, 0);
}

export const SUPPORT_PERFORMANCE_RANGES = ['7d', '30d', '90d'] as const;
export type SupportPerformanceRange =
  (typeof SUPPORT_PERFORMANCE_RANGES)[number];

export function daysForPerformanceRange(
  range: SupportPerformanceRange = '30d',
): number {
  if (range === '7d') return 7;
  if (range === '90d') return 90;
  return 30;
}

export function utcDayWindow(snapshotDate: string): {
  snapshotDate: string;
  from: Date;
  toExclusive: Date;
} {
  const from = new Date(`${snapshotDate}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime())) {
    throw new Error('Invalid snapshot_date');
  }
  return {
    snapshotDate,
    from,
    toExclusive: new Date(from.getTime() + DAY_MS),
  };
}

export function yesterdayUtcDate(now: Date = new Date()): string {
  const utc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  utc.setUTCDate(utc.getUTCDate() - 1);
  return utc.toISOString().slice(0, 10);
}
