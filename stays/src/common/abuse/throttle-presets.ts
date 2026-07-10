/**
 * Shared abuse-protection limits for Nest Throttler.
 * Production is strict; development stays usable for local QA.
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

/** Login / PIN / account-creation style endpoints */
export const AUTH_THROTTLE = {
  short: { limit: isProd ? 3 : 30, ttl: 1000 },
  default: { limit: isProd ? 10 : 120, ttl: 60_000 },
};

/** Public listing search / scrape-prone GETs */
export const PUBLIC_SEARCH_THROTTLE = {
  short: { limit: isProd ? 5 : 50, ttl: 1000 },
  default: { limit: isProd ? 30 : 200, ttl: 60_000 },
};

/** Public media / review photo fetches */
export const PUBLIC_MEDIA_THROTTLE = {
  short: { limit: isProd ? 10 : 100, ttl: 1000 },
  default: { limit: isProd ? 60 : 500, ttl: 60_000 },
};

/** Booking create / host apply */
export const SENSITIVE_WRITE_THROTTLE = {
  short: { limit: isProd ? 2 : 20, ttl: 1000 },
  default: { limit: isProd ? 5 : 50, ttl: 60_000 },
};

/**
 * Future AI / generation endpoints — keep tight to control cost & abuse.
 * Apply with: @Throttle(AI_GENERATION_THROTTLE)
 */
export const AI_GENERATION_THROTTLE = {
  short: { limit: isProd ? 1 : 10, ttl: 1000 },
  default: { limit: isProd ? 10 : 60, ttl: 60_000 },
};
