/**
 * Host booking list filter / ops-rank SQL — exact parity with
 * nexastays_web/lib/host-booking-center.ts
 * (matchesHostBookingFilter, classifyHostBookingUrgency, URGENCY_RANK).
 *
 * Ops ORDER BY equivalence (proven against client sortHostBookingsForOps):
 *   urgency rank ASC → checkin_date ASC → id ASC
 * using only persisted columns status, checkin_date, checkout_date.
 */

import type { HostBookingFilterParam } from '../dto/host-bookings-list.dto';

export const STAY_ACTIVE_SQL = `('CONFIRMED', 'CHECKED_IN')`;
export const CHECKOUT_ELIGIBLE_SQL = `('CONFIRMED', 'CHECKED_IN', 'COMPLETED')`;
export const PAYMENT_PENDING_SQL = `('INITIATED', 'PAYMENT_PENDING')`;
export const CANCELLED_SQL = `('CANCELLED_BY_GUEST', 'CANCELLED_BY_HOST', 'EXPIRED')`;

/**
 * Urgency rank 0..8 matching URGENCY_RANK — branch order matches
 * classifyHostBookingUrgency (checkout_today before checkin_today, etc.).
 */
export function opsUrgencyRankSql(alias = 'b'): string {
  return `
CASE
  WHEN ${alias}.status IN ${CHECKOUT_ELIGIBLE_SQL}
    AND ${alias}.checkout_date = CAST(:today AS date) THEN 0
  WHEN ${alias}.status IN ${STAY_ACTIVE_SQL}
    AND ${alias}.checkin_date = CAST(:today AS date) THEN 1
  WHEN ${alias}.status IN ${STAY_ACTIVE_SQL}
    AND ${alias}.checkin_date = CAST(:tomorrow AS date) THEN 2
  WHEN ${alias}.status IN ${PAYMENT_PENDING_SQL} THEN 3
  WHEN ${alias}.status IN ${STAY_ACTIVE_SQL}
    AND ${alias}.checkin_date <= CAST(:today AS date)
    AND ${alias}.checkout_date > CAST(:today AS date) THEN 4
  WHEN ${alias}.status IN ${STAY_ACTIVE_SQL}
    AND ${alias}.checkin_date > CAST(:today AS date) THEN 5
  WHEN ${alias}.status = 'COMPLETED' THEN 6
  WHEN ${alias}.status IN ${CANCELLED_SQL} THEN 7
  ELSE 8
END`.replace(/\s+/g, ' ').trim();
}

/** Primary guest display name — parity with resolveGuestDisplayName. */
export function guestDisplayNameSql(bookingAlias = 'b'): string {
  return `COALESCE(
    (SELECT TRIM(o.full_name) FROM stays_booking_occupants o
      WHERE o.booking_id = ${bookingAlias}.id AND o.is_primary = true
      LIMIT 1),
    (SELECT TRIM(o.full_name) FROM stays_booking_occupants o
      WHERE o.booking_id = ${bookingAlias}.id
        AND TRIM(COALESCE(o.full_name, '')) <> ''
      ORDER BY o.id ASC
      LIMIT 1),
    (SELECT TRIM(o.full_name) FROM stays_booking_occupants o
      WHERE o.booking_id = ${bookingAlias}.id
      ORDER BY o.id ASC
      LIMIT 1)
  )`;
}

/**
 * Filter predicates — exact parity with matchesHostBookingFilter.
 * checkin_today excludes checkout_today (classifier checks checkout first).
 */
export function applyHostBookingFilterSql(
  filter: HostBookingFilterParam,
  alias = 'b',
): string | null {
  switch (filter) {
    case 'all':
      return null;
    case 'today':
      return `(
        (
          ${alias}.status IN ${STAY_ACTIVE_SQL}
          AND ${alias}.checkin_date = CAST(:today AS date)
          AND NOT (
            ${alias}.status IN ${CHECKOUT_ELIGIBLE_SQL}
            AND ${alias}.checkout_date = CAST(:today AS date)
          )
        )
        OR (
          ${alias}.status IN ${CHECKOUT_ELIGIBLE_SQL}
          AND ${alias}.checkout_date = CAST(:today AS date)
        )
      )`;
    case 'checkin_today':
      return `(
        ${alias}.status IN ${STAY_ACTIVE_SQL}
        AND ${alias}.checkin_date = CAST(:today AS date)
        AND NOT (
          ${alias}.status IN ${CHECKOUT_ELIGIBLE_SQL}
          AND ${alias}.checkout_date = CAST(:today AS date)
        )
      )`;
    case 'checkout_today':
      return `(
        ${alias}.status IN ${CHECKOUT_ELIGIBLE_SQL}
        AND ${alias}.checkout_date = CAST(:today AS date)
      )`;
    case 'upcoming':
      return `(
        ${alias}.status IN ${STAY_ACTIVE_SQL}
        AND ${alias}.checkin_date > CAST(:today AS date)
      )`;
    case 'current':
      // staying OR (checkin_today && checkout > today)
      // ≡ STAY_ACTIVE && checkin <= today && checkout > today
      // (checkout_today has checkout = today, so excluded)
      return `(
        ${alias}.status IN ${STAY_ACTIVE_SQL}
        AND ${alias}.checkin_date <= CAST(:today AS date)
        AND ${alias}.checkout_date > CAST(:today AS date)
      )`;
    case 'awaiting_payment':
      return `(${alias}.status IN ${PAYMENT_PENDING_SQL})`;
    case 'completed':
      return `(${alias}.status = 'COMPLETED')`;
    case 'cancelled':
      return `(${alias}.status IN ${CANCELLED_SQL})`;
    default:
      return null;
  }
}

export function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
