/**
 * Live DB verification of distinct-listing keyset walk.
 * Mirrors listHostListingsPage default sort with +1ms tie window
 * (JS Date/toISOString is ms-only; PG timestamptz keeps microseconds).
 */
require('dotenv').config();
const { Client } = require('pg');

const LIMIT = 20;

const c = new Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

(async () => {
  await c.connect();
  const hostRow = await c.query(
    `SELECT host_user_id, COUNT(*)::int AS n
     FROM stays_listings
     GROUP BY host_user_id
     ORDER BY n DESC
     LIMIT 1`,
  );
  const hostId = hostRow.rows[0].host_user_id;
  const portfolio = hostRow.rows[0].n;

  const seen = new Set();
  /** @type {Date | null} */
  let createdAt = null;
  /** @type {string | null} */
  let id = null;
  let pages = 0;
  let hasNext = true;

  while (hasNext) {
    const params = [hostId, LIMIT + 1];
    let sql = `
      SELECT l.id, l.created_at
      FROM stays_listings l
      WHERE l.host_user_id = $1`;
    if (createdAt != null && id != null) {
      const cEnd = new Date(createdAt.getTime() + 1);
      params.push(createdAt, cEnd, id);
      sql += `
        AND (
          l.created_at < $3
          OR (
            l.created_at >= $3
            AND l.created_at < $4
            AND l.id < $5::uuid
          )
        )`;
    }
    sql += `
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT $2`;

    const r = await c.query(sql, params);
    pages += 1;
    hasNext = r.rows.length > LIMIT;
    const page = hasNext ? r.rows.slice(0, LIMIT) : r.rows;

    for (const row of page) {
      if (seen.has(row.id)) {
        console.error('FAIL duplicate', row.id);
        process.exit(1);
      }
      seen.add(row.id);
    }

    if (page.length === 0) break;
    const last = page[page.length - 1];
    // Round-trip like API: Date → toISOString → Date (ms truncation)
    createdAt = new Date(last.created_at.toISOString());
    id = last.id;
  }

  console.log(
    JSON.stringify({
      portfolio,
      loaded: seen.size,
      pages,
      duplicates: 0,
      missing: portfolio - seen.size,
      pass: seen.size === portfolio,
    }),
  );
  await c.end();
  if (seen.size !== portfolio) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
