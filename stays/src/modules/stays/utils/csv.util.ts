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

export function bookingNights(
  checkin: Date | string,
  checkout: Date | string,
): number {
  const a = typeof checkin === 'string' ? parseDateOnly(checkin) : startOfUtcDay(checkin);
  const b =
    typeof checkout === 'string' ? parseDateOnly(checkout) : startOfUtcDay(checkout);
  if (!a || !b) return 0;
  const ms = b.getTime() - a.getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function parseDateOnly(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
