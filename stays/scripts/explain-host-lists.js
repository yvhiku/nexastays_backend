require('dotenv').config();
const { Client } = require('pg');
const c = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionTimeoutMillis: 8000,
});

async function run(name, sql) {
  try {
    const r = await c.query(sql);
    console.log('=== ' + name + ' ===');
    console.log(r.rows.map((x) => x['QUERY PLAN']).join('\n'));
  } catch (e) {
    console.log('=== ' + name + ' ERROR ===');
    console.log(e.message);
  }
}

(async () => {
  await c.connect();
  await run(
    'bookings_created_at',
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
     SELECT b.id FROM stays_bookings b
     INNER JOIN stays_listings listing ON listing.id = b.listing_id
     WHERE listing.host_user_id = COALESCE(
       (SELECT host_user_id FROM stays_listings LIMIT 1),
       '00000000-0000-0000-0000-000000000000'::uuid
     )
     ORDER BY b.created_at DESC, b.id DESC
     LIMIT 21`,
  );
  await run(
    'listings_created_at',
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
     SELECT l.id FROM stays_listings l
     WHERE l.host_user_id = COALESCE(
       (SELECT host_user_id FROM stays_listings LIMIT 1),
       '00000000-0000-0000-0000-000000000000'::uuid
     )
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT 21`,
  );
  await run(
    'bookings_checkin',
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
     SELECT b.id FROM stays_bookings b
     INNER JOIN stays_listings listing ON listing.id = b.listing_id
     WHERE listing.host_user_id = COALESCE(
       (SELECT host_user_id FROM stays_listings LIMIT 1),
       '00000000-0000-0000-0000-000000000000'::uuid
     )
     ORDER BY b.checkin_date ASC, b.id ASC
     LIMIT 21`,
  );
  await c.end();
})().catch((e) => {
  console.error('CONNECT', e.message);
  process.exit(1);
});
