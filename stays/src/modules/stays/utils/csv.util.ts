import { bookingNightsBetween } from './booking-date.util';

export function escapeCsv(value: unknown): string {
  if (value == null) return '';
  const stringValue = String(value);
  if (
    stringValue.includes(',') ||
    stringValue.includes('"') ||
    stringValue.includes('\n') ||
    stringValue.includes('\r')
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export function buildCsv(headers: string[], rows: unknown[][]): string {
  const lines = [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => row.map(escapeCsv).join(',')),
  ];
  return `\uFEFF${lines.join('\n')}`;
}

export function formatCsvDate(value: Date | string | null | undefined): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
    if (m) return m[1];
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return formatUtcDate(d);
  }
  return formatUtcDate(value);
}

export function formatCsvTimestamp(
  value: Date | string | null | undefined,
): string {
  if (value == null || value === '') return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}

function formatUtcDate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Same rule as bookingNightsBetween; accepts Date values via UTC calendar day. */
export function bookingNights(
  checkin: Date | string,
  checkout: Date | string,
): number {
  const a = typeof checkin === 'string' ? checkin : formatUtcYmd(checkin);
  const b = typeof checkout === 'string' ? checkout : formatUtcYmd(checkout);
  try {
    return Math.max(0, bookingNightsBetween(a, b));
  } catch {
    return 0;
  }
}

function formatUtcYmd(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
