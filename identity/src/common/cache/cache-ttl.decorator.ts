import { SetMetadata } from '@nestjs/common';
import { CACHE_TTL_KEY } from './http-cache.interceptor';

/**
 * Set cache TTL in seconds for the next HttpCacheInterceptor.
 * Use 30 for user-level data (me, balance, kyc/status), 15 for admin queues.
 */
export const CacheTTL = (seconds: number) =>
  SetMetadata(CACHE_TTL_KEY, seconds);
