import { BadRequestException } from '@nestjs/common';

type Ymd = { year: number; month: number; day: number };

/** Parse YYYY-MM-DD components (also accepts trailing time suffixes). */
export function parseBookingYmd(value: string): Ymd {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) {
    throw new BadRequestException('Invalid date format. Use YYYY-MM-DD.');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Validate calendar date via UTC construction (DST-independent).
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new BadRequestException('Invalid date.');
  }
  return { year, month, day };
}

/** Parse YYYY-MM-DD as a local calendar date for DB date columns. */
export function parseBookingDateOnly(value: string): Date {
  const { year, month, day } = parseBookingYmd(value);
  return new Date(year, month - 1, day);
}

/**
 * Authoritative stay length: check-in inclusive, check-out exclusive.
 * Uses UTC calendar midnights so DST cannot change night counts.
 *
 * Examples: 2026-08-10 → 2026-08-11 = 1; 2026-08-10 → 2026-08-12 = 2.
 */
export function bookingNightsBetween(checkin: string, checkout: string): number {
  const a = parseBookingYmd(checkin);
  const b = parseBookingYmd(checkout);
  const ms =
    Date.UTC(b.year, b.month - 1, b.day) -
    Date.UTC(a.year, a.month - 1, a.day);
  return Math.trunc(ms / 86_400_000);
}

export function assertMinOneNightStay(checkin: string, checkout: string): void {
  if (bookingNightsBetween(checkin, checkout) < 1) {
    throw new BadRequestException(
      'Check-out must be at least one night after check-in.',
    );
  }
}
