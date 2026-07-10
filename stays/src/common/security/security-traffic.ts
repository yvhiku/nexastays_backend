import { safeLogger } from '../logging/safe-logger';

/**
 * In-process detector for bursty auth failures / rate-limit hits per IP.
 * Emits structured security logs when thresholds are crossed.
 */
const WINDOW_MS = 60_000;
const AUTH_FAIL_THRESHOLD = parseInt(
  process.env.SECURITY_AUTH_FAIL_BURST || '20',
  10,
);
const RATE_LIMIT_THRESHOLD = parseInt(
  process.env.SECURITY_RATE_LIMIT_BURST || '30',
  10,
);

type Bucket = { count: number; resetAt: number };

const authFails = new Map<string, Bucket>();
const rateLimits = new Map<string, Bucket>();

function bump(map: Map<string, Bucket>, key: string): number {
  const now = Date.now();
  const cur = map.get(key);
  if (!cur || now >= cur.resetAt) {
    map.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return 1;
  }
  cur.count += 1;
  return cur.count;
}

function clientIp(req: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): string {
  const xf = req.headers?.['x-forwarded-for'];
  const fromHeader = Array.isArray(xf)
    ? xf[0]
    : typeof xf === 'string'
      ? xf.split(',')[0].trim()
      : '';
  return (
    fromHeader ||
    req.ip ||
    req.socket?.remoteAddress ||
    '0.0.0.0'
  );
}

export function noteAuthFailure(
  req: {
    ip?: string;
    headers?: Record<string, string | string[] | undefined>;
    socket?: { remoteAddress?: string };
    method?: string;
    url?: string;
    path?: string;
  },
  meta?: Record<string, unknown>,
): void {
  const ip = clientIp(req);
  const n = bump(authFails, ip);
  safeLogger.info('security.auth_failure', {
    ip,
    path: req.path || req.url,
    method: req.method,
    burstCount: n,
    ...meta,
  });
  if (n >= AUTH_FAIL_THRESHOLD) {
    safeLogger.info('security.unusual_traffic', {
      kind: 'AUTH_FAILURE_BURST',
      ip,
      count: n,
      windowMs: WINDOW_MS,
    });
  }
}

export function noteRateLimited(
  req: {
    ip?: string;
    headers?: Record<string, string | string[] | undefined>;
    socket?: { remoteAddress?: string };
    method?: string;
    url?: string;
    path?: string;
  },
): void {
  const ip = clientIp(req);
  const n = bump(rateLimits, ip);
  safeLogger.info('security.rate_limited', {
    ip,
    path: req.path || req.url,
    method: req.method,
    burstCount: n,
  });
  if (n >= RATE_LIMIT_THRESHOLD) {
    safeLogger.info('security.unusual_traffic', {
      kind: 'RATE_LIMIT_BURST',
      ip,
      count: n,
      windowMs: WINDOW_MS,
    });
  }
}

export function noteApiError(
  req: {
    ip?: string;
    headers?: Record<string, string | string[] | undefined>;
    socket?: { remoteAddress?: string };
    method?: string;
    url?: string;
    path?: string;
    requestId?: string;
  },
  status: number,
  message: string,
): void {
  const payload = {
    ip: clientIp(req),
    path: req.path || req.url,
    method: req.method,
    status,
    message: message.slice(0, 200),
    requestId: req.requestId,
  };
  if (status >= 500) {
    safeLogger.error('security.api_error', undefined, payload);
  } else {
    safeLogger.info('security.api_error', payload);
  }

  if (status === 401 || status === 403) {
    noteAuthFailure(req, { status });
  }
  if (status === 429) {
    noteRateLimited(req);
  }
}
