/**
 * DEV-ONLY: seed random LIVE Morocco listings for Explore / map load testing.
 *
 * Ratings are NOT faked — avg_rating / review_count stay at DB defaults until
 * real PUBLISHED rows exist in stays_listing_reviews (ReviewAggregateService).
 *
 * Usage:
 *   npm run seed:listings
 *   npm run seed:listings -- --count 1000
 *   npm run seed:listings -- --clean --count 500
 *   SEED_HOST_USER_ID=<uuid> npm run seed:listings
 *
 * Cleanup (also via --clean):
 *   DELETE FROM stays_listings WHERE title LIKE 'Seed · %';
 */
import 'dotenv/config';
import { Client } from 'pg';

const TITLE_PREFIX = 'Seed · ';
const DEFAULT_COUNT = 1000;

const CITIES: Array<{ city: string; lat: number; lng: number }> = [
  { city: 'Casablanca', lat: 33.5731, lng: -7.5898 },
  { city: 'Marrakech', lat: 31.6295, lng: -7.9811 },
  { city: 'Rabat', lat: 34.0209, lng: -6.8416 },
  { city: 'Fes', lat: 34.0181, lng: -5.0078 },
  { city: 'Tangier', lat: 35.7595, lng: -5.834 },
  { city: 'Agadir', lat: 30.4278, lng: -9.5981 },
  { city: 'Meknes', lat: 33.8935, lng: -5.5473 },
  { city: 'Oujda', lat: 34.6814, lng: -1.9086 },
  { city: 'Essaouira', lat: 31.5085, lng: -9.7595 },
  { city: 'Chefchaouen', lat: 35.1688, lng: -5.2636 },
  { city: 'Tetouan', lat: 35.5889, lng: -5.3626 },
  { city: 'Kenitra', lat: 34.261, lng: -6.5802 },
  { city: 'Nador', lat: 35.1688, lng: -2.9287 },
  { city: 'Taghazout', lat: 30.5448, lng: -9.7111 },
  { city: 'Ifrane', lat: 33.5228, lng: -5.11 },
];

const NEIGHBORHOODS = [
  'Centre',
  'Medina',
  'Maarif',
  'Gueliz',
  'Hassan',
  'Agdal',
  'Corniche',
  'Ville Nouvelle',
  'Kasbah',
  'Beachfront',
];

const TYPES = ['APARTMENT', 'RIAD', 'VILLA', 'HOTEL', 'HOSTEL'] as const;

const AMENITY_POOLS: string[][] = [
  ['wifi', 'kitchen', 'ac', 'tv', 'hot_water'],
  ['wifi', 'heating', 'washing_machine', 'parking'],
  ['wifi', 'pool', 'kitchen', 'safe', 'accessible'],
  ['wifi', 'ac', 'tv', 'workspace'],
  ['kitchen', 'hot_water', 'heating'],
];

function parseArgs(argv: string[]) {
  let count = Number(process.env.SEED_COUNT || DEFAULT_COUNT);
  let clean = process.env.SEED_CLEAN === '1' || process.env.SEED_CLEAN === 'true';
  let hostUserId = process.env.SEED_HOST_USER_ID?.trim() || '';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--clean') clean = true;
    else if (arg === '--count' && argv[i + 1]) {
      count = Number(argv[++i]);
    } else if (arg.startsWith('--count=')) {
      count = Number(arg.slice('--count='.length));
    } else if (arg === '--host' && argv[i + 1]) {
      hostUserId = argv[++i];
    } else if (arg.startsWith('--host=')) {
      hostUserId = arg.slice('--host='.length);
    }
  }

  if (!Number.isFinite(count) || count < 1) {
    throw new Error(`Invalid --count: ${count}`);
  }
  return { count: Math.floor(count), clean, hostUserId };
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function jitter(n: number, spread = 0.09): number {
  return n + (Math.random() - 0.5) * spread;
}

function unitKind(type: (typeof TYPES)[number]): string {
  switch (type) {
    case 'HOTEL':
      return 'HOTEL_ROOM';
    case 'HOSTEL':
      return 'HOSTEL_PRIVATE';
    case 'RIAD':
      return 'RIAD_ROOM';
    case 'VILLA':
      return 'VILLA_UNIT';
    default:
      return 'APARTMENT_UNIT';
  }
}

function bookingModel(type: (typeof TYPES)[number]): string {
  switch (type) {
    case 'HOTEL':
      return 'ROOM_TYPES';
    case 'HOSTEL':
      return 'DORM_AND_PRIVATE';
    default:
      return 'ENTIRE_PROPERTY';
  }
}

function bedroomsJson(bedroomCount: number, guests: number) {
  const sleeps = Math.max(1, Math.ceil(guests / bedroomCount));
  return Array.from({ length: bedroomCount }, (_, i) => ({
    label: `Bedroom ${i + 1}`,
    sleeps,
    bed_summary: '1 bed',
    private_bathroom: i === 0,
  }));
}

async function main() {
  const { count, clean, hostUserId: hostArg } = parseArgs(process.argv.slice(2));

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5434', 10),
    user: process.env.DB_USERNAME || 'nexa_stays',
    password: process.env.DB_PASSWORD || 'nexa_stays_dev',
    database: process.env.DB_NAME || 'nexa_stays',
  });

  await client.connect();

  try {
    let hostUserId = hostArg;
    if (!hostUserId) {
      const hostRes = await client.query<{ user_id: string }>(
        `SELECT user_id
         FROM stays_host_profiles
         WHERE host_verification_status = 'APPROVED'
         ORDER BY created_at ASC
         LIMIT 1`,
      );
      hostUserId = hostRes.rows[0]?.user_id ?? '';
    }
    if (!hostUserId) {
      throw new Error(
        'No APPROVED host found. Pass --host <uuid> or set SEED_HOST_USER_ID.',
      );
    }

    const approved = await client.query(
      `SELECT 1 FROM stays_host_profiles
       WHERE user_id = $1 AND host_verification_status = 'APPROVED'`,
      [hostUserId],
    );
    if (approved.rowCount === 0) {
      throw new Error(`Host ${hostUserId} is missing or not APPROVED.`);
    }

    await client.query('BEGIN');

    if (clean) {
      const del = await client.query(
        `DELETE FROM stays_listings WHERE title LIKE $1`,
        [`${TITLE_PREFIX}%`],
      );
      console.log(`Cleaned ${del.rowCount ?? 0} previous seed listings.`);
    }

    const batchSize = 100;
    let created = 0;

    for (let offset = 0; offset < count; offset += batchSize) {
      const n = Math.min(batchSize, count - offset);
      const listings: Array<{
        title: string;
        listing_type: string;
        booking_model: string;
        city: string;
        neighborhood: string;
        geo_lat: number;
        geo_lng: number;
        property_details: object;
        instant_booking: boolean;
        max_guests: number;
        amenities: string[];
        pets_policy: string;
        smoking_policy: string;
        quiet_hours: boolean;
        cancellation_policy: string;
        base_price: number;
        weekend_price: number;
        cleaning_fee: number;
        unit_kind: string;
        created_at: string;
      }> = [];

      const batchBaseMs = Date.now() - offset * 1000;

      for (let i = 0; i < n; i++) {
        const idx = offset + i + 1;
        const place = CITIES[(offset + i) % CITIES.length];
        const listingType = pick(TYPES);
        const guests = 1 + Math.floor(Math.random() * 8);
        const bedroomCount = 1 + Math.floor(Math.random() * 4);
        const price = Math.round((150 + Math.random() * 2350) * 100) / 100;

        listings.push({
          title: `${TITLE_PREFIX}${listingType.charAt(0)}${listingType.slice(1).toLowerCase()} in ${place.city} #${idx}`,
          listing_type: listingType,
          booking_model: bookingModel(listingType),
          city: place.city,
          neighborhood: pick(NEIGHBORHOODS),
          geo_lat: jitter(place.lat),
          geo_lng: jitter(place.lng),
          property_details: {
            bedrooms: bedroomsJson(bedroomCount, guests),
            checkin_method: 'IN_PERSON',
            guest_language: 'fr',
          },
          instant_booking: Math.random() < 0.45,
          max_guests: guests,
          amenities: pick(AMENITY_POOLS),
          pets_policy: pick(['NO', 'ALLOWED', 'DOGS_CATS'] as const),
          smoking_policy: pick(['NOT_ALLOWED', 'ALLOWED'] as const),
          quiet_hours: Math.random() < 0.4,
          cancellation_policy: pick(['FLEXIBLE', 'MODERATE', 'STRICT'] as const),
          base_price: price,
          weekend_price:
            Math.round(price * (1.05 + Math.random() * 0.2) * 100) / 100,
          cleaning_fee: Math.round(Math.random() * 150 * 100) / 100,
          unit_kind: unitKind(listingType),
          // Stagger timestamps so keyset pagination never collapses a whole batch.
          created_at: new Date(batchBaseMs - i * 1000).toISOString(),
        });
      }

      const listingRes = await client.query<{ id: string; title: string }>(
         `INSERT INTO stays_listings (
           host_user_id, title, listing_type, booking_model, city, country,
           neighborhood, geo_lat, geo_lng, status, description,
           property_details, safety_features, policies,
           instant_booking,
           checkin_time, checkout_time, created_at, updated_at
         )
         SELECT
           $1::uuid,
           x.title,
           x.listing_type,
           x.booking_model,
           x.city,
           'MA',
           x.neighborhood,
           x.geo_lat,
           x.geo_lng,
           'LIVE',
           'Dev seed listing for Explore load testing in Morocco.',
           x.property_details::jsonb,
           '{}'::jsonb,
           '{}'::jsonb,
           x.instant_booking,
           '14:00',
           '11:00',
           x.created_at::timestamptz,
           x.created_at::timestamptz
         FROM jsonb_to_recordset($2::jsonb) AS x(
           title text,
           listing_type text,
           booking_model text,
           city text,
           neighborhood text,
           geo_lat double precision,
           geo_lng double precision,
           property_details jsonb,
           instant_booking boolean,
           created_at text
         )
         RETURNING id, title`,
        [hostUserId, JSON.stringify(listings)],
      );

      const byTitle = new Map(listings.map((l) => [l.title, l]));
      const rulesPayload = listingRes.rows.map((row) => {
        const src = byTitle.get(row.title)!;
        return {
          listing_id: row.id,
          pets_policy: src.pets_policy,
          smoking_policy: src.smoking_policy,
          quiet_hours: src.quiet_hours,
          max_guests: src.max_guests,
          amenities: src.amenities,
          cancellation_policy: src.cancellation_policy,
          base_price: src.base_price,
          weekend_price: src.weekend_price,
          cleaning_fee: src.cleaning_fee,
          unit_kind: src.unit_kind,
          title: src.title,
        };
      });

      await client.query(
        `INSERT INTO stays_listing_rules (
           listing_id, pets_policy, smoking_policy, quiet_hours,
           couples_welcome, max_guests, amenities, cancellation_policy
         )
         SELECT
           x.listing_id::uuid,
           x.pets_policy,
           x.smoking_policy,
           x.quiet_hours,
           true,
           x.max_guests,
           x.amenities::jsonb,
           x.cancellation_policy
         FROM jsonb_to_recordset($1::jsonb) AS x(
           listing_id text,
           pets_policy text,
           smoking_policy text,
           quiet_hours boolean,
           max_guests int,
           amenities jsonb,
           cancellation_policy text
         )`,
        [JSON.stringify(rulesPayload)],
      );

      await client.query(
        `INSERT INTO stays_rate_plans (
           listing_id, currency, base_price, weekend_price, cleaning_fee
         )
         SELECT
           x.listing_id::uuid,
           'MAD',
           x.base_price,
           x.weekend_price,
           x.cleaning_fee
         FROM jsonb_to_recordset($1::jsonb) AS x(
           listing_id text,
           base_price numeric,
           weekend_price numeric,
           cleaning_fee numeric
         )`,
        [JSON.stringify(rulesPayload)],
      );

      await client.query(
        `INSERT INTO stays_check_in_contacts (
           listing_id, full_name, phone_encrypted, role, access_instructions
         )
         SELECT
           x.listing_id::uuid,
           'Seed Host Contact',
           '+212600000000',
           'OWNER',
           'Seed check-in — call on arrival.'
         FROM jsonb_to_recordset($1::jsonb) AS x(listing_id text)`,
        [JSON.stringify(rulesPayload)],
      );

      await client.query(
        `INSERT INTO stays_listing_unit_types (
           listing_id, kind, name, quantity, max_guests,
           pricing_unit, base_price, currency, sort_order, is_active
         )
         SELECT
           x.listing_id::uuid,
           x.unit_kind,
           x.title,
           1,
           x.max_guests,
           'NIGHT',
           x.base_price,
           'MAD',
           0,
           true
         FROM jsonb_to_recordset($1::jsonb) AS x(
           listing_id text,
           unit_kind text,
           title text,
           max_guests int,
           base_price numeric
         )`,
        [JSON.stringify(rulesPayload)],
      );

      created += listingRes.rows.length;
      process.stdout.write(`\rSeeded ${created}/${count} listings...`);
    }

    await client.query('COMMIT');
    console.log(`\nDone. ${created} LIVE Morocco listings for host ${hostUserId}`);
    console.log(`Titles use prefix "${TITLE_PREFIX}" — re-run with --clean to replace.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
