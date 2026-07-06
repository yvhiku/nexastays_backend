import { BadRequestException } from '@nestjs/common';

/** Parse YYYY-MM-DD as a local calendar date (avoids UTC midnight drift). */
export function parseBookingDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) {
    throw new BadRequestException('Invalid date format. Use YYYY-MM-DD.');
  }
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const d = new Date(year, month, day);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month ||
    d.getDate() !== day
  ) {
    throw new BadRequestException('Invalid date.');
  }
  return d;
}

export function bookingNightsBetween(checkin: string, checkout: string): number {
  const a = parseBookingDateOnly(checkin).getTime();
  const b = parseBookingDateOnly(checkout).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export function assertMinOneNightStay(checkin: string, checkout: string): void {
  if (bookingNightsBetween(checkin, checkout) < 1) {
    throw new BadRequestException(
      'Check-out must be at least one night after check-in.',
    );
  }
}
