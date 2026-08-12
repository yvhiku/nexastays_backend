require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const c = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

(async () => {
  await c.connect();
  const sqlPath = path.resolve(
    __dirname,
    '../../../database/stays/migrations/035_host_list_pagination_indexes.sql',
  );
  await c.query(fs.readFileSync(sqlPath, 'utf8'));
  console.log('indexes applied');
  const r = await c.query(`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    SELECT b.id FROM stays_bookings b
    INNER JOIN stays_listings listing ON listing.id = b.listing_id
    WHERE listing.host_user_id = (SELECT host_user_id FROM stays_listings LIMIT 1)
    ORDER BY b.created_at DESC, b.id DESC
    LIMIT 21`);
  console.log(r.rows.map((x) => x['QUERY PLAN']).join('\n'));
  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
