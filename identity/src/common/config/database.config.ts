import { requireSecret } from '../security/secrets';

const isProd = process.env.NODE_ENV === 'production';
const synchronize = process.env.DB_SYNCHRONIZE === 'true';
if (isProd && synchronize) {
  throw new Error('DB_SYNCHRONIZE must be false in production.');
}
if (isProd && process.env.DB_SSL !== 'true') {
  throw new Error('DB_SSL=true is required in production.');
}

export const databaseConfig = {
  type: 'postgres' as const,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433', 10),
  username: process.env.DB_USERNAME || 'nexa_identity',
  password: requireSecret('DB_PASSWORD', { devFallback: 'nexa_identity_dev' }),
  database: process.env.DB_NAME || 'nexa_identity',
  synchronize,
  ssl: isProd
    ? {
        rejectUnauthorized:
          process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      }
    : undefined,
  logging: process.env.NODE_ENV === 'development',
  extra: {
    max: parseInt(process.env.DB_POOL_MAX || '15', 10),
    idleTimeoutMillis: parseInt(
      process.env.DB_POOL_IDLE_TIMEOUT || '30000',
      10,
    ),
    connectionTimeoutMillis: parseInt(
      process.env.DB_POOL_CONNECT_TIMEOUT || '2000',
      10,
    ),
  },
};
