import { DateTime } from 'luxon';

/** Dashboard calendar zone — locked for H3 host KPIs. */
export const DASHBOARD_TIMEZONE = 'Africa/Casablanca';

export type DashboardNow = {
  asOfIso: string;
  timezone: typeof DASHBOARD_TIMEZONE;
  /** Casablanca calendar date YYYY-MM-DD */
  today: string;
  tomorrow: string;
  thisMonthStart: string;
  thisMonthEndExclusive: string;
  previousMonthStart: string;
  previousMonthEndExclusive: string;
  /** Inclusive start of next 30 Casablanca days window (today). */
  in30EndExclusive: string;
  year: number;
  month: number;
  previousYear: number;
  previousMonth: number;
  daysInThisMonth: number;
  daysInPreviousMonth: number;
  /** Instant representing Casablanca start-of-today (for lifecycle helpers). */
  nowJs: Date;
};

/**
 * Casablanca wall-clock bounds for host dashboard aggregation.
 * Pass `at` in tests to freeze time.
 */
export function getDashboardNow(at: Date | DateTime = DateTime.utc()): DashboardNow {
  const dt =
    at instanceof DateTime
      ? at.setZone(DASHBOARD_TIMEZONE)
      : DateTime.fromJSDate(at, { zone: 'utc' }).setZone(DASHBOARD_TIMEZONE);

  const startOfToday = dt.startOf('day');
  const tomorrow = startOfToday.plus({ days: 1 });
  const thisMonthStart = startOfToday.startOf('month');
  const nextMonthStart = thisMonthStart.plus({ months: 1 });
  const previousMonthStart = thisMonthStart.minus({ months: 1 });
  const in30End = startOfToday.plus({ days: 30 });

  return {
    asOfIso: dt.toUTC().toISO()!,
    timezone: DASHBOARD_TIMEZONE,
    today: startOfToday.toISODate()!,
    tomorrow: tomorrow.toISODate()!,
    thisMonthStart: thisMonthStart.toISODate()!,
    thisMonthEndExclusive: nextMonthStart.toISODate()!,
    previousMonthStart: previousMonthStart.toISODate()!,
    previousMonthEndExclusive: thisMonthStart.toISODate()!,
    in30EndExclusive: in30End.toISODate()!,
    year: thisMonthStart.year,
    month: thisMonthStart.month,
    previousYear: previousMonthStart.year,
    previousMonth: previousMonthStart.month,
    daysInThisMonth: thisMonthStart.daysInMonth!,
    daysInPreviousMonth: previousMonthStart.daysInMonth!,
    nowJs: startOfToday.toJSDate(),
  };
}

/** Normalize booking check-in / check-out to YYYY-MM-DD (date-only). */
export function toDateOnlyYmd(value: Date | string): string {
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  // Date columns are calendar dates — use UTC date parts if ISO midnight, else local.
  if (
    typeof value === 'string' ||
    (d.getUTCHours() === 0 &&
      d.getUTCMinutes() === 0 &&
      d.getUTCSeconds() === 0)
  ) {
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** Instant → Casablanca calendar YYYY-MM-DD. */
export function toCasablancaYmd(value: Date | string): string {
  const dt =
    typeof value === 'string'
      ? DateTime.fromISO(value, { zone: 'utc' })
      : DateTime.fromJSDate(value, { zone: 'utc' });
  return dt.setZone(DASHBOARD_TIMEZONE).toISODate()!;
}

export function ymdCompare(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function ymdInHalfOpen(ymd: string, start: string, endExclusive: string): boolean {
  return ymdCompare(ymd, start) >= 0 && ymdCompare(ymd, endExclusive) < 0;
}

/**
 * Nights of [checkin, checkout) that fall inside calendar month
 * (year/month are 1-based Casablanca calendar).
 */
export function bookedNightsInCalendarMonth(
  checkinYmd: string,
  checkoutYmd: string,
  year: number,
  month: number,
): number {
  const monthStart = DateTime.fromObject(
    { year, month, day: 1 },
    { zone: DASHBOARD_TIMEZONE },
  );
  const monthEnd = monthStart.plus({ months: 1 });
  const checkin = DateTime.fromISO(checkinYmd, { zone: DASHBOARD_TIMEZONE });
  const checkout = DateTime.fromISO(checkoutYmd, { zone: DASHBOARD_TIMEZONE });
  const start = checkin > monthStart ? checkin : monthStart;
  const end = checkout < monthEnd ? checkout : monthEnd;
  if (end <= start) return 0;
  return Math.round(end.diff(start, 'days').days);
}
