import {
  assertMinOneNightStay,
  bookingNightsBetween,
} from './booking-date.util';

describe('bookingNightsBetween — calendar date nights (DST-safe)', () => {
  it('1 night', () => {
    expect(bookingNightsBetween('2026-08-10', '2026-08-11')).toBe(1);
  });

  it('2 nights', () => {
    expect(bookingNightsBetween('2026-08-10', '2026-08-12')).toBe(2);
  });

  it('7 nights', () => {
    expect(bookingNightsBetween('2026-08-10', '2026-08-17')).toBe(7);
  });

  it('rejects same-day stay', () => {
    expect(bookingNightsBetween('2026-08-10', '2026-08-10')).toBe(0);
    expect(() => assertMinOneNightStay('2026-08-10', '2026-08-10')).toThrow(
      /at least one night/i,
    );
  });

  it('checkout before check-in yields negative night count', () => {
    expect(bookingNightsBetween('2026-08-12', '2026-08-10')).toBe(-2);
    expect(() => assertMinOneNightStay('2026-08-12', '2026-08-10')).toThrow(
      /at least one night/i,
    );
  });

  it('accepts date-only strings with trailing time suffix', () => {
    expect(
      bookingNightsBetween('2026-08-10T00:00:00', '2026-08-12T12:00:00'),
    ).toBe(2);
  });

  /**
   * US DST fall-back (2026-11-01) can make local midnights 25 hours apart.
   * Math.ceil on local Date duration would over-count; UTC YMD must stay exact.
   */
  it('DST fall-back boundary remains exact calendar nights', () => {
    expect(bookingNightsBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(bookingNightsBetween('2026-11-01', '2026-11-02')).toBe(1);
  });

  /**
   * US DST spring-forward (2026-03-08) can make local midnights 23 hours apart.
   */
  it('DST spring-forward boundary remains exact calendar nights', () => {
    expect(bookingNightsBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(bookingNightsBetween('2026-03-08', '2026-03-09')).toBe(1);
  });

  it('rejects invalid calendar dates', () => {
    expect(() => bookingNightsBetween('2026-02-30', '2026-03-01')).toThrow(
      /Invalid date/i,
    );
  });
});
