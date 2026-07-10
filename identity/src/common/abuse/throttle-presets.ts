/**
 * Shared abuse-protection limits for Nest Throttler (Identity).
 */

const isProd = process.env.NODE_ENV === 'production';

export const THROTTLE_SHORT = {
  name: 'short' as const,
  ttl: 1000,
  limit: isProd ? 15 : 200,
};

export const THROTTLE_DEFAULT = {
  name: 'default' as const,
  ttl: 60_000,
  limit: isProd ? 100 : 5000,
};

export const AUTH_THROTTLE = {
  short: { limit: isProd ? 3 : 30, ttl: 1000 },
  default: { limit: isProd ? 10 : 120, ttl: 60_000 },
};

export const ACCOUNT_CREATE_THROTTLE = {
  short: { limit: isProd ? 2 : 20, ttl: 1000 },
  default: { limit: isProd ? 5 : 60, ttl: 60_000 },
};

/** Future AI / generation endpoints */
export const AI_GENERATION_THROTTLE = {
  short: { limit: isProd ? 1 : 10, ttl: 1000 },
  default: { limit: isProd ? 10 : 60, ttl: 60_000 },
};
