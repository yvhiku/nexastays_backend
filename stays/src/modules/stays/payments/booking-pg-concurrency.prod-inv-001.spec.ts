/**
 * PROD-INV-001 — Real PostgreSQL booking concurrency verification.
 *
 * Uses two independent `pg` clients + a shared barrier so transactions overlap.
 * Does NOT use Jest mocks.
 *
 * Local (recommended against compose stays-db):
 *   STAYS_PG_CONCURRENCY=1 npm run test:pg-concurrency
 *
 * Defaults: postgresql://nexa_stays:nexa_stays_dev@127.0.0.1:5434/nexa_stays
 *
 * CI: sets STAYS_PG_CONCURRENCY=1 and STAYS_PG_CONCURRENCY_BOOTSTRAP=1 against
 * an ephemeral postgres:16 with a minimal schema matching the EXCLUDE constraint.
 */

import { randomUUID } from 'crypto';
import { Client } from 'pg';

const ENABLED = process.env.STAYS_PG_CONCURRENCY === '1';
const BOOTSTRAP = process.env.STAYS_PG_CONCURRENCY_BOOTSTRAP === '1';

const connectionConfig = () => {
  if (process.env.STAYS_DATABASE_URL?.trim()) {
    return { connectionString: process.env.STAYS_DATABASE_URL.trim() };
  }
  return {
    host: process.env.STAYS_PG_HOST ?? '127.0.0.1',
    port: Number(process.env.STAYS_PG_PORT ?? 5434),
    user: process.env.STAYS_PG_USER ?? 'nexa_stays',
    password: process.env.STAYS_PG_PASSWORD ?? 'nexa_stays_dev',
    database: process.env.STAYS_PG_DATABASE ?? 'nexa_stays',
  };
};

const RUN_TAG = `prod-inv-001-${Date.now()}`;
const TIMEOUT_MS = 20_000;

type InsertResult =
  | { ok: true; id: string; startedAt: number; endedAt: number }
  | {
      ok: false;
      code: string | undefined;
      message: string;
      startedAt: number;
      endedAt: number;
    };

/** Exclusion conflict or deadlock abort — both leave inventory consistent. */
function isInventoryConflictCode(code: string | undefined): boolean {
  return code === '23P01' || code === '40P01';
}

function assertEnabled(): void {
  if (!ENABLED) {
    throw new Error(
      'PROD-INV-001 requires STAYS_PG_CONCURRENCY=1 against a real PostgreSQL instance.',
    );
  }
}

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client(connectionConfig());
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end().catch(() => undefined);
  }
}

async function bootstrapIfNeeded(c: Client): Promise<void> {
  if (!BOOTSTRAP) return;
  await c.query(`
    CREATE EXTENSION IF NOT EXISTS btree_gist;
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS stays_listings (
      id UUID PRIMARY KEY,
      host_user_id UUID NOT NULL,
      title VARCHAR(200) NOT NULL,
      listing_type VARCHAR(20) NOT NULL DEFAULT 'APARTMENT',
      city VARCHAR(100) NOT NULL DEFAULT 'Test',
      status VARCHAR(30) NOT NULL DEFAULT 'LIVE',
      checkin_time TIME NOT NULL DEFAULT '14:00',
      checkout_time TIME NOT NULL DEFAULT '11:00',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS stays_bookings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      listing_id UUID NOT NULL REFERENCES stays_listings(id) ON DELETE RESTRICT,
      guest_user_id UUID NOT NULL,
      booking_reference VARCHAR(32) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'INITIATED'
        CHECK (status IN (
          'INITIATED', 'PAYMENT_PENDING', 'CONFIRMED',
          'CHECKED_IN', 'COMPLETED',
          'CANCELLED_BY_GUEST', 'CANCELLED_BY_HOST', 'EXPIRED'
        )),
      checkin_date DATE NOT NULL,
      checkout_date DATE NOT NULL,
      guest_count INT NOT NULL DEFAULT 1,
      total_subtotal DECIMAL(18, 2) NOT NULL DEFAULT 100,
      guest_fee DECIMAL(18, 2) NOT NULL DEFAULT 0,
      host_fee DECIMAL(18, 2) NOT NULL DEFAULT 0,
      total_paid DECIMAL(18, 2) DEFAULT 100,
      payout_amount DECIMAL(18, 2) DEFAULT 100,
      currency CHAR(3) NOT NULL DEFAULT 'MAD',
      idempotency_key VARCHAR(64),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_stays_bookings_checkout_after_checkin
        CHECK (checkout_date > checkin_date)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_stays_bookings_booking_reference
      ON stays_bookings (booking_reference);
  `);

  const exists = await c.query(
    `SELECT 1 FROM pg_constraint WHERE conname = 'ex_stays_bookings_active_overlap'`,
  );
  if (exists.rowCount === 0) {
    await c.query(`
      ALTER TABLE stays_bookings
        ADD CONSTRAINT ex_stays_bookings_active_overlap
        EXCLUDE USING gist (
          listing_id WITH =,
          daterange(checkin_date, checkout_date, '[)') WITH &&
        )
        WHERE (status IN ('INITIATED', 'PAYMENT_PENDING', 'CONFIRMED', 'CHECKED_IN'));
    `);
  }
}

async function createListing(c: Client): Promise<string> {
  const id = randomUUID();
  await c.query(
    `INSERT INTO stays_listings (id, host_user_id, title, listing_type, city, status)
     VALUES ($1, $2, $3, 'APARTMENT', 'ConcurrencyCity', 'LIVE')`,
    [id, randomUUID(), `PROD-INV-001 ${RUN_TAG}`],
  );
  return id;
}

async function countActiveOverlaps(
  c: Client,
  listingId: string,
  checkin: string,
  checkout: string,
): Promise<number> {
  const r = await c.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n
     FROM stays_bookings
     WHERE listing_id = $1
       AND status IN ('INITIATED', 'PAYMENT_PENDING', 'CONFIRMED', 'CHECKED_IN')
       AND checkin_date < $3::date
       AND checkout_date > $2::date`,
    [listingId, checkin, checkout],
  );
  return Number(r.rows[0]?.n ?? 0);
}

async function cleanupListing(c: Client, listingId: string): Promise<void> {
  await c.query(`DELETE FROM stays_bookings WHERE listing_id = $1`, [listingId]);
  await c.query(`DELETE FROM stays_listings WHERE id = $1`, [listingId]);
}

/**
 * Concurrent overlapping inserts with a latch so both BEGIN before either INSERT.
 */
async function concurrentInserts(params: {
  listingId: string;
  ranges: Array<{ checkin: string; checkout: string; status?: string }>;
}): Promise<InsertResult[]> {
  const started = params.ranges.map(() => false);
  let releaseBarrier!: () => void;
  const barrier = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });

  const markReady = () => {
    if (started.every(Boolean)) releaseBarrier();
  };

  const runners = params.ranges.map((range, idx) =>
    (async (): Promise<InsertResult> => {
      const client = new Client(connectionConfig());
      await client.connect();
      const guest = randomUUID();
      const bookingId = randomUUID();
      const ref = `NST-CI-${RUN_TAG.slice(-6)}-${idx}-${bookingId.slice(0, 6)}`;
      const startedAt = Date.now();
      try {
        await client.query('BEGIN');
        started[idx] = true;
        markReady();
        await Promise.race([
          barrier,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('barrier timeout')), TIMEOUT_MS),
          ),
        ]);
        // Small jitter so both are mid-transaction under contention
        await new Promise((r) => setTimeout(r, 5));
        await client.query(
          `INSERT INTO stays_bookings (
             id, listing_id, guest_user_id, booking_reference, status,
             checkin_date, checkout_date, guest_count, total_subtotal, total_paid, payout_amount
           ) VALUES ($1,$2,$3,$4,$5,$6::date,$7::date,1,100,100,100)`,
          [
            bookingId,
            params.listingId,
            guest,
            ref,
            range.status ?? 'PAYMENT_PENDING',
            range.checkin,
            range.checkout,
          ],
        );
        await client.query('COMMIT');
        return { ok: true, id: bookingId, startedAt, endedAt: Date.now() };
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        const e = err as { code?: string; message?: string };
        return {
          ok: false,
          code: e.code,
          message: e.message ?? String(err),
          startedAt,
          endedAt: Date.now(),
        };
      } finally {
        await client.end().catch(() => undefined);
      }
    })(),
  );

  return Promise.all(runners);
}

(ENABLED ? describe : describe.skip)('PROD-INV-001 real PostgreSQL concurrency', () => {
  let admin: Client;
  let listingA: string;
  let listingB: string;
  const listingIds: string[] = [];

  beforeAll(async () => {
    assertEnabled();
    admin = new Client(connectionConfig());
    await admin.connect();
    await bootstrapIfNeeded(admin);

    const ver = await admin.query<{ version: string }>('SELECT version()');
    // eslint-disable-next-line no-console
    console.log('[PROD-INV-001] PostgreSQL:', ver.rows[0]?.version);

    const constraint = await admin.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def
       FROM pg_constraint WHERE conname = 'ex_stays_bookings_active_overlap'`,
    );
    if (!constraint.rowCount) {
      throw new Error('Live DB missing ex_stays_bookings_active_overlap');
    }
    // eslint-disable-next-line no-console
    console.log('[PROD-INV-001] Constraint:', constraint.rows[0]?.def);

    listingA = await createListing(admin);
    listingB = await createListing(admin);
    listingIds.push(listingA, listingB);
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    for (const id of listingIds) {
      await cleanupListing(admin, id).catch(() => undefined);
    }
    await admin.end().catch(() => undefined);
  });

  it('constraint exists in live catalog with expected predicate', async () => {
    const r = await admin.query<{
      conname: string;
      relname: string;
      def: string;
    }>(
      `SELECT c.conname, t.relname, pg_get_constraintdef(c.oid) AS def
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       WHERE c.conname = 'ex_stays_bookings_active_overlap'`,
    );
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].relname).toBe('stays_bookings');
    expect(r.rows[0].def).toMatch(/EXCLUDE USING gist/i);
    expect(r.rows[0].def).toMatch(/daterange\(checkin_date, checkout_date/i);
    expect(r.rows[0].def).toMatch(/INITIATED/);
    expect(r.rows[0].def).toMatch(/PAYMENT_PENDING/);
    expect(r.rows[0].def).toMatch(/CONFIRMED/);
    expect(r.rows[0].def).toMatch(/CHECKED_IN/);
    expect(r.rows[0].def).not.toMatch(/COMPLETED/);
  });

  it('exact overlap: only one of two concurrent creates succeeds', async () => {
    const results = await concurrentInserts({
      listingId: listingA,
      ranges: [
        { checkin: '2030-06-01', checkout: '2030-06-05' },
        { checkin: '2030-06-01', checkout: '2030-06-05' },
      ],
    });

    const successes = results.filter((r) => r.ok);
    const failures = results.filter((r) => !r.ok);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(isInventoryConflictCode(failures[0].code)).toBe(true);
    // Deadlock (40P01) can occur under concurrent GiST EXCLUDE locks; either way inventory is safe.
    if (failures[0].code === '23P01') {
      expect(failures[0].message).toMatch(/ex_stays_bookings_active_overlap/);
    }

    // Overlap evidence: both transactions began before either finished
    const overlapWindow =
      Math.min(...results.map((r) => r.endedAt)) >
      Math.min(...results.map((r) => r.startedAt));
    expect(overlapWindow).toBe(true);

    expect(
      await countActiveOverlaps(admin, listingA, '2030-06-01', '2030-06-05'),
    ).toBe(1);
  }, TIMEOUT_MS);

  it('partial overlap: only one succeeds', async () => {
    // Clean prior exact-overlap winner nights for same listing by using new dates
    const results = await concurrentInserts({
      listingId: listingA,
      ranges: [
        { checkin: '2030-07-01', checkout: '2030-07-05' },
        { checkin: '2030-07-04', checkout: '2030-07-08' },
      ],
    });
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
    expect(isInventoryConflictCode(results.find((r) => !r.ok)?.code)).toBe(true);
    expect(
      await countActiveOverlaps(admin, listingA, '2030-07-01', '2030-07-08'),
    ).toBe(1);
  }, TIMEOUT_MS);

  it('adjacent nights (checkout = next check-in): both succeed — half-open [)', async () => {
    const results = await concurrentInserts({
      listingId: listingA,
      ranges: [
        { checkin: '2030-08-01', checkout: '2030-08-05' },
        { checkin: '2030-08-05', checkout: '2030-08-08' },
      ],
    });
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(
      await countActiveOverlaps(admin, listingA, '2030-08-01', '2030-08-08'),
    ).toBe(2);
  }, TIMEOUT_MS);

  it('different listings same dates: both succeed', async () => {
    const results = await concurrentInserts({
      listingId: listingA,
      ranges: [{ checkin: '2030-09-01', checkout: '2030-09-04' }],
    });
    const resultsB = await concurrentInserts({
      listingId: listingB,
      ranges: [{ checkin: '2030-09-01', checkout: '2030-09-04' }],
    });
    // Also prove true concurrency across listings:
    const dual = await Promise.all([
      concurrentInserts({
        listingId: listingA,
        ranges: [{ checkin: '2030-09-10', checkout: '2030-09-12' }],
      }),
      concurrentInserts({
        listingId: listingB,
        ranges: [{ checkin: '2030-09-10', checkout: '2030-09-12' }],
      }),
    ]);
    expect(results[0].ok).toBe(true);
    expect(resultsB[0].ok).toBe(true);
    expect(dual[0][0].ok).toBe(true);
    expect(dual[1][0].ok).toBe(true);
  }, TIMEOUT_MS);

  it('failed transaction leaves no orphan booking row', async () => {
    const listing = await createListing(admin);
    listingIds.push(listing);
    const results = await concurrentInserts({
      listingId: listing,
      ranges: [
        { checkin: '2030-10-01', checkout: '2030-10-03' },
        { checkin: '2030-10-01', checkout: '2030-10-03' },
      ],
    });
    const fail = results.find((r) => !r.ok);
    expect(fail?.ok).toBe(false);
    const count = await admin.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM stays_bookings WHERE listing_id = $1`,
      [listing],
    );
    expect(Number(count.rows[0].n)).toBe(1);
  }, TIMEOUT_MS);

  it('same-row confirm vs cancel: exactly one wins with status predicate', async () => {
    const listing = await createListing(admin);
    listingIds.push(listing);
    const bookingId = randomUUID();
    await admin.query(
      `INSERT INTO stays_bookings (
         id, listing_id, guest_user_id, booking_reference, status,
         checkin_date, checkout_date, guest_count, total_subtotal, total_paid, payout_amount
       ) VALUES ($1,$2,$3,$4,'PAYMENT_PENDING','2030-11-01','2030-11-03',1,100,100,100)`,
      [bookingId, listing, randomUUID(), `NST-CI-${bookingId.slice(0, 8)}`],
    );

    let release!: () => void;
    const barrier = new Promise<void>((r) => {
      release = r;
    });
    const ready = [false, false];
    const mark = () => {
      if (ready.every(Boolean)) release();
    };

    const race = async (sql: string): Promise<number> => {
      const client = new Client(connectionConfig());
      await client.connect();
      try {
        await client.query('BEGIN');
        ready[sql.includes('CONFIRMED') ? 0 : 1] = true;
        mark();
        await barrier;
        const r = await client.query(sql, [bookingId]);
        await client.query('COMMIT');
        return r.rowCount ?? 0;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw e;
      } finally {
        await client.end().catch(() => undefined);
      }
    };

    const [a, b] = await Promise.all([
      race(
        `UPDATE stays_bookings SET status = 'CONFIRMED', updated_at = NOW()
         WHERE id = $1 AND status = 'PAYMENT_PENDING'`,
      ),
      race(
        `UPDATE stays_bookings SET status = 'CANCELLED_BY_GUEST', updated_at = NOW()
         WHERE id = $1 AND status = 'PAYMENT_PENDING'`,
      ),
    ]);

    expect([a, b].sort()).toEqual([0, 1]);
    const final = await admin.query<{ status: string }>(
      `SELECT status FROM stays_bookings WHERE id = $1`,
      [bookingId],
    );
    expect(['CONFIRMED', 'CANCELLED_BY_GUEST']).toContain(final.rows[0].status);
  }, TIMEOUT_MS);

  it('same-row expire vs confirm: exactly one wins', async () => {
    const listing = await createListing(admin);
    listingIds.push(listing);
    const bookingId = randomUUID();
    await admin.query(
      `INSERT INTO stays_bookings (
         id, listing_id, guest_user_id, booking_reference, status,
         checkin_date, checkout_date, guest_count, total_subtotal, total_paid, payout_amount
       ) VALUES ($1,$2,$3,$4,'PAYMENT_PENDING','2030-12-01','2030-12-03',1,100,100,100)`,
      [bookingId, listing, randomUUID(), `NST-CI-${bookingId.slice(0, 8)}`],
    );

    let release!: () => void;
    const barrier = new Promise<void>((r) => {
      release = r;
    });
    const ready = [false, false];
    const mark = () => {
      if (ready.every(Boolean)) release();
    };

    const race = async (toStatus: string, slot: number): Promise<number> => {
      const client = new Client(connectionConfig());
      await client.connect();
      try {
        await client.query('BEGIN');
        ready[slot] = true;
        mark();
        await barrier;
        const r = await client.query(
          `UPDATE stays_bookings SET status = $2, updated_at = NOW()
           WHERE id = $1 AND status = 'PAYMENT_PENDING'`,
          [bookingId, toStatus],
        );
        await client.query('COMMIT');
        return r.rowCount ?? 0;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw e;
      } finally {
        await client.end().catch(() => undefined);
      }
    };

    const [a, b] = await Promise.all([
      race('CONFIRMED', 0),
      race('EXPIRED', 1),
    ]);
    expect([a, b].sort()).toEqual([0, 1]);
  }, TIMEOUT_MS);

  it('stress: many concurrent exact overlaps → exactly one winner', async () => {
    const listing = await createListing(admin);
    listingIds.push(listing);
    const N = Number(process.env.STAYS_PG_CONCURRENCY_STRESS ?? 20);
    const ranges = Array.from({ length: N }, () => ({
      checkin: '2031-01-01',
      checkout: '2031-01-05',
    }));
    const results = await concurrentInserts({ listingId: listing, ranges });
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).length).toBe(N - 1);
    expect(
      await countActiveOverlaps(admin, listing, '2031-01-01', '2031-01-05'),
    ).toBe(1);
  }, 60_000);

  it('COMPLETED bookings do not participate in exclusion (product rule)', async () => {
    const listing = await createListing(admin);
    listingIds.push(listing);
    await admin.query(
      `INSERT INTO stays_bookings (
         id, listing_id, guest_user_id, booking_reference, status,
         checkin_date, checkout_date, guest_count, total_subtotal, total_paid, payout_amount
       ) VALUES ($1,$2,$3,$4,'COMPLETED','2031-02-01','2031-02-05',1,100,100,100)`,
      [randomUUID(), listing, randomUUID(), `NST-CI-done-${randomUUID().slice(0, 6)}`],
    );
    const results = await concurrentInserts({
      listingId: listing,
      ranges: [{ checkin: '2031-02-01', checkout: '2031-02-05' }],
    });
    expect(results[0].ok).toBe(true);
  }, TIMEOUT_MS);
});

// Keep TypeScript happy when suite is skipped — export for tooling
export { withClient, connectionConfig };
