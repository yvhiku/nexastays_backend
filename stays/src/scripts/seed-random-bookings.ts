/**
 * DEV-ONLY: seed random bookings across existing LIVE listings.
 *
 * Usage:
 *   npm run seed:bookings
 *   npm run seed:bookings -- --count 100
 *   npm run seed:bookings -- --clean --count 100
 *   npm run seed:bookings -- --listing <uuid>
 *
 * Cleanup (also via --clean):
 *   DELETE bookings where idempotency_key LIKE 'seed-bk-%'
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { Client } from 'pg';

const IDEMPOTENCY_PREFIX = 'seed-bk-';
const DEFAULT_COUNT = 100;
const GUEST_FEE_PCT = 0.05;
const HOST_FEE_PCT = 0.05;

const GUEST_NAMES = [
  'Yasmine Alami',
  'Omar Benali',
  'Sara Idrissi',
  'Karim Tazi',
  'Nora Chraibi',
  'Amine Fassi',
  'Lina Bennani',
  'Hassan Amrani',
  'Ines Kadiri',
  'Mehdi Ouazzani',
];

type ListingRow = {
  id: string;
  host_user_id: string;
  title: string;
  city: string;
  max_guests: number | null;
  base_price: string;
  cleaning_fee: string;
  currency: string;
};

function parseArgs(argv: string[]) {
  let count = Number(process.env.SEED_BOOKING_COUNT || DEFAULT_COUNT);
  let clean =
    process.env.SEED_BOOKING_CLEAN === '1' ||
    process.env.SEED_BOOKING_CLEAN === 'true';
  let listingId = process.env.SEED_LISTING_ID?.trim() || '';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--clean') clean = true;
    else if (arg === '--count' && argv[i + 1]) count = Number(argv[++i]);
    else if (arg.startsWith('--count=')) {
      count = Number(arg.slice('--count='.length));
    } else if (arg === '--listing' && argv[i + 1]) listingId = argv[++i];
    else if (arg.startsWith('--listing=')) {
      listingId = arg.slice('--listing='.length);
    }
  }

  if (!Number.isFinite(count) || count < 1) {
    throw new Error(`Invalid --count: ${count}`);
  }
  return { count: Math.floor(count), clean, listingId };
}

function pick<T>(arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('Cannot pick from empty array');
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function fees(subtotal: number) {
  const guestFee = round2(subtotal * GUEST_FEE_PCT);
  const hostFee = round2(subtotal * HOST_FEE_PCT);
  return {
    guestFee,
    hostFee,
    totalPaid: round2(subtotal + guestFee),
    payoutAmount: round2(subtotal - hostFee),
  };
}

async function main() {
  const { count, clean, listingId } = parseArgs(process.argv.slice(2));

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5434', 10),
    user: process.env.DB_USERNAME || 'nexa_stays',
    password: process.env.DB_PASSWORD || 'nexa_stays_dev',
    database: process.env.DB_NAME || 'nexa_stays',
  });

  await client.connect();

  try {
    await client.query('BEGIN');

    if (clean) {
      const del = await client.query(
        `DELETE FROM stays_bookings
         WHERE idempotency_key LIKE $1`,
        [`${IDEMPOTENCY_PREFIX}%`],
      );
      console.log(`Cleaned ${del.rowCount ?? 0} previous seed bookings.`);
    }

    const listingParams: unknown[] = [];
    let listingSql = `
      SELECT
        l.id,
        l.host_user_id,
        l.title,
        l.city,
        r.max_guests,
        rp.base_price::text AS base_price,
        COALESCE(rp.cleaning_fee, 0)::text AS cleaning_fee,
        COALESCE(rp.currency, 'MAD') AS currency
      FROM stays_listings l
      JOIN stays_rate_plans rp ON rp.listing_id = l.id
      LEFT JOIN stays_listing_rules r ON r.listing_id = l.id
      WHERE l.status = 'LIVE'
        AND rp.base_price > 0
    `;
    if (listingId) {
      listingParams.push(listingId);
      listingSql += ` AND l.id = $1`;
    }
    listingSql += ` ORDER BY l.created_at DESC`;

    const listingsRes = await client.query(listingSql, listingParams);
    const listings = listingsRes.rows as ListingRow[];
    if (listings.length === 0) {
      throw new Error(
        listingId
          ? `No LIVE listing found for id=${listingId} (needs base_price > 0).`
          : 'No LIVE listings with base_price > 0 found. Approve + set-live at least one listing first.',
      );
    }

    console.log(`Using ${listings.length} LIVE listing(s). Seeding ${count} bookings…`);

    // Per-listing cursor so active bookings never overlap (exclusion constraint).
    const nextFree = new Map<string, Date>();
    const existing = await client.query<{
      listing_id: string;
      checkout_date: string;
    }>(
      `SELECT listing_id, MAX(checkout_date)::text AS checkout_date
       FROM stays_bookings
       WHERE status IN ('INITIATED', 'PAYMENT_PENDING', 'CONFIRMED', 'CHECKED_IN')
         AND listing_id = ANY($1::uuid[])
       GROUP BY listing_id`,
      [listings.map((l) => l.id)],
    );
    for (const row of existing.rows) {
      nextFree.set(row.listing_id, addDays(new Date(`${row.checkout_date}T00:00:00Z`), 0));
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    let created = 0;
    let attempts = 0;
    const maxAttempts = count * 20;

    while (created < count && attempts < maxAttempts) {
      attempts++;
      const listing = pick(listings);
      const nights = 1 + Math.floor(Math.random() * 5); // 1–5 nights
      const wantPast = Math.random() < 0.55;

      let checkin: Date;
      let checkout: Date;
      let status: 'COMPLETED' | 'CONFIRMED' | 'CHECKED_IN';

      if (wantPast) {
        // Past COMPLETED stays can overlap each other (exclusion ignores COMPLETED).
        const startOffset = 10 + Math.floor(Math.random() * 180);
        checkout = addDays(today, -startOffset);
        checkin = addDays(checkout, -nights);
        status = 'COMPLETED';
      } else {
        const gap = 1 + Math.floor(Math.random() * 4);
        const cursor =
          nextFree.get(listing.id) ?? addDays(today, 1 + Math.floor(Math.random() * 7));
        checkin = addDays(cursor, gap);
        checkout = addDays(checkin, nights);
        status = Math.random() < 0.2 ? 'CHECKED_IN' : 'CONFIRMED';
        nextFree.set(listing.id, checkout);
      }

      const maxGuests = Math.max(1, listing.max_guests ?? 4);
      const guestCount = 1 + Math.floor(Math.random() * Math.min(4, maxGuests));
      const basePrice = Number(listing.base_price);
      const cleaningFee = Number(listing.cleaning_fee) || 0;
      const subtotal = round2(basePrice * nights + cleaningFee);
      const { guestFee, hostFee, totalPaid, payoutAmount } = fees(subtotal);

      let guestUserId = randomUUID();
      while (guestUserId === listing.host_user_id) {
        guestUserId = randomUUID();
      }

      const bookingId = randomUUID();
      const idempotencyKey = `${IDEMPOTENCY_PREFIX}${created + 1}-${bookingId.slice(0, 8)}`;
      const confirmedAt = addDays(checkin, -2).toISOString();
      const completedAt =
        status === 'COMPLETED' ? checkout.toISOString() : null;
      const paidAt = confirmedAt;

      try {
        await client.query(
          `INSERT INTO stays_bookings (
             id, listing_id, guest_user_id, status,
             checkin_date, checkout_date, guest_count,
             total_subtotal, guest_fee, host_fee, total_paid, payout_amount,
             currency, idempotency_key, confirmed_at, completed_at, paid_at
           ) VALUES (
             $1, $2, $3, $4,
             $5::date, $6::date, $7,
             $8, $9, $10, $11, $12,
             $13, $14, $15::timestamptz, $16::timestamptz, $17::timestamptz
           )`,
          [
            bookingId,
            listing.id,
            guestUserId,
            status,
            toDateOnly(checkin),
            toDateOnly(checkout),
            guestCount,
            subtotal,
            guestFee,
            hostFee,
            totalPaid,
            payoutAmount,
            listing.currency || 'MAD',
            idempotencyKey,
            confirmedAt,
            completedAt,
            paidAt,
          ],
        );

        await client.query(
          `INSERT INTO stays_booking_occupants (
             booking_id, full_name, id_number, is_primary
           ) VALUES ($1, $2, $3, true)`,
          [
            bookingId,
            pick(GUEST_NAMES),
            `MA${Math.floor(10000000 + Math.random() * 89999999)}`,
          ],
        );

        created++;
        if (created % 20 === 0 || created === count) {
          console.log(`  … ${created}/${count}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('ex_stays_bookings_active_overlap') || msg.includes('overlap')) {
          nextFree.set(listing.id, addDays(checkout, 2));
          continue;
        }
        throw err;
      }
    }

    if (created < count) {
      throw new Error(
        `Only created ${created}/${count} bookings after ${attempts} attempts (date conflicts?).`,
      );
    }

    await client.query('COMMIT');
    console.log(`Done. Inserted ${created} seed bookings (idempotency ${IDEMPOTENCY_PREFIX}*).`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
