import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';

/**
 * Production-safe HTTP surface: trust proxy, HSTS, optional HTTPS redirect.
 * TLS termination is expected at the load balancer; apps honor X-Forwarded-Proto.
 */
export function applySecureHttp(app: NestExpressApplication): void {
  const isProd = process.env.NODE_ENV === 'production';
  const trustProxy =
    process.env.TRUST_PROXY === 'true' ||
    process.env.TRUST_PROXY === '1' ||
    isProd;

  if (trustProxy) {
    const hops = parseInt(process.env.TRUST_PROXY_HOPS || '1', 10);
    app.set('trust proxy', Number.isFinite(hops) && hops > 0 ? hops : 1);
  }

  app.use(
    helmet({
      contentSecurityPolicy: isProd,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: isProd
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.disable('x-powered-by');

  const enforceHttps =
    isProd && process.env.ENFORCE_HTTPS !== 'false';
  if (enforceHttps) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      const proto = String(req.headers['x-forwarded-proto'] || '')
        .split(',')[0]
        .trim()
        .toLowerCase();
      if (proto === 'http') {
        const host = req.headers.host || 'localhost';
        res.redirect(301, `https://${host}${req.originalUrl || req.url}`);
        return;
      }
      next();
    });
  }
}

export function resolveCorsOrigin():
  | boolean
  | string[]
  | ((
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => void) {
  const isProd = process.env.NODE_ENV === 'production';
  const raw = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!isProd) {
    return true;
  }
  if (raw.length === 0) {
    throw new Error(
      'CORS_ORIGINS must be set in production (comma-separated https origins).',
    );
  }
  return raw;
}
