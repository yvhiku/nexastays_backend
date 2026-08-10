import { BOOKED_STATUSES } from './stays-availability.service';

/** Mirrors migration 016 / live ex_stays_bookings_active_overlap WHERE clause. */
const DB_EXCLUDE_STATUSES = [
  'INITIATED',
  'PAYMENT_PENDING',
  'CONFIRMED',
  'CHECKED_IN',
] as const;

describe('PROD-INV-001 booking inventory status semantics', () => {
  it('BOOKED_STATUSES matches DB exclusion statuses (no COMPLETED)', () => {
    expect([...BOOKED_STATUSES].sort()).toEqual([...DB_EXCLUDE_STATUSES].sort());
    expect(BOOKED_STATUSES).not.toContain('COMPLETED');
    expect(BOOKED_STATUSES).not.toContain('EXPIRED');
    expect(BOOKED_STATUSES).not.toContain('CANCELLED_BY_GUEST');
    expect(BOOKED_STATUSES).not.toContain('CANCELLED_BY_HOST');
  });
});
