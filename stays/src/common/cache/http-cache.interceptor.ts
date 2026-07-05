import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { MetricsService } from '../metrics/metrics.service';

export const CACHE_TTL_KEY = 'cache_ttl';

/** Prefix for wallet balance cache keys (path part). Matches buildCacheKey when path is /api/v1/wallets/balance. */
const BALANCE_CACHE_PATH = 'v1/wallets/balance';

/** Cache key for a user's balance response. Use when invalidating after ledger changes (e.g. ride completion). */
export function getBalanceCacheKey(userId: string): string {
  return `cache:${BALANCE_CACHE_PATH}:user:${userId}`;
}

/**
 * Builds a cache key for read-only GET endpoints.
 * - User-scoped: path + userId (e.g. users/me, wallets/balance)
 * - Admin list: path + sorted query (e.g. admin/kyc/applications?status=PENDING)
 * - Other: path + query
 * Never caches sensitive data (no PIN, OTP, tokens in key).
 */
function buildCacheKey(request: {
  url?: string;
  user?: { userId?: string };
  query?: Record<string, unknown>;
}): string {
  const url = request.url ?? '';
  const path = url.split('?')[0];
  const userId = request.user?.userId;
  const query = request.query ?? {};
  const normalizedPath = path.replace(/^\/[^/]+\//, ''); // drop api/v1 or similar prefix for stability

  const keys = Object.keys(query).sort();
  const queryString =
    keys.length > 0
      ? keys.map((k) => `${k}=${String(query[k])}`).join('&')
      : '';
  // Admin list endpoints: key by query so different filters get different cache entries
  if (
    normalizedPath.includes('admin') &&
    normalizedPath.includes('applications')
  ) {
    return `cache:${normalizedPath}:q:${queryString || 'all'}`;
  }
  if (userId && typeof userId === 'string') {
    return `cache:${normalizedPath}:user:${userId}`;
  }
  if (queryString) return `cache:${normalizedPath}:q:${queryString}`;
  return `cache:${normalizedPath}`;
}

@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly reflector: Reflector,
    private readonly metricsService: MetricsService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest();
    if (request.method !== 'GET') {
      return next.handle();
    }

    const key = buildCacheKey(request);
    const ttl =
      this.reflector.get<number>(CACHE_TTL_KEY, context.getHandler()) ?? 60;

    try {
      const cached = await this.cacheManager.get(key);
      if (cached !== undefined && cached !== null) {
        this.metricsService.incrementDbCacheHit();
        return of(cached);
      }
    } catch {
      // cache get error: proceed to handler
    }
    this.metricsService.incrementDbCacheMiss();

    return next.handle().pipe(
      tap(async (data) => {
        try {
          await this.cacheManager.set(key, data, ttl * 1000);
        } catch {
          // ignore set errors
        }
      }),
    );
  }
}
