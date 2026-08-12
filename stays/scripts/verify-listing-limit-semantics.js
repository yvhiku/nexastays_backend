require('dotenv').config();
const { Client } = require('pg');

const c = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

(async () => {
  await c.connect();
  const host = await c.query(
    `SELECT host_user_id, COUNT(*)::int AS n FROM stays_listings GROUP BY host_user_id ORDER BY n DESC LIMIT 1`,
  );
  const hostId = host.rows[0]?.host_user_id;
  const total = host.rows[0]?.n ?? 0;
  console.log('host_listings', total);

  const joined = await c.query(
    `SELECT COUNT(*)::int AS row_count,
            COUNT(DISTINCT l.id)::int AS listing_count
     FROM stays_listings l
     LEFT JOIN stays_listing_media m ON m.listing_id = l.id
     WHERE l.host_user_id = $1
     LIMIT 21`,
    [hostId],
  );
  // LIMIT with join in subquery form that mirrors TypeORM take on joined select:
  const bad = await c.query(
    `SELECT COUNT(*)::int AS distinct_in_limit FROM (
       SELECT l.id
       FROM stays_listings l
       LEFT JOIN stays_listing_media m ON m.listing_id = l.id
       WHERE l.host_user_id = $1
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT 21
     ) t`,
    [hostId],
  );
  const good = await c.query(
    `SELECT COUNT(*)::int AS distinct_in_limit FROM (
       SELECT l.id
       FROM stays_listings l
       WHERE l.host_user_id = $1
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT 21
     ) t`,
    [hostId],
  );
  console.log('bad_join_limit_distinct', bad.rows[0].distinct_in_limit);
  console.log('good_listing_limit_distinct', good.rows[0].distinct_in_limit);
  console.log('joined_probe', joined.rows[0]);
  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
