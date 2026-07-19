import type { EntityManager } from 'typeorm';

/**
 * Allocates the next NST-{YYYY}-{NNNNNN} reference inside a transaction.
 * Uses stays_booking_ref_counters for yearly sequences.
 */
export async function allocateBookingReference(
  manager: EntityManager,
  at: Date = new Date(),
): Promise<string> {
  const year = at.getUTCFullYear();
  const rows: Array<{ last_seq: number | string }> = await manager.query(
    `
    INSERT INTO stays_booking_ref_counters (year, last_seq)
    VALUES ($1, 1)
    ON CONFLICT (year) DO UPDATE
    SET last_seq = stays_booking_ref_counters.last_seq + 1
    RETURNING last_seq
    `,
    [year],
  );
  const seq = Number(rows?.[0]?.last_seq);
  if (!Number.isFinite(seq) || seq < 1) {
    throw new Error('Failed to allocate booking reference');
  }
  return `NST-${year}-${String(seq).padStart(6, '0')}`;
}
