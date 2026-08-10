import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cookie-bearing state-changing requests (PROD-SEC-001):
 * After removing ambient access-cookie auth, the primary cookie is `nexa_refresh`
 * (refresh/logout). Legacy `nexa_access` may still appear briefly until cleared;
 * both trigger Origin checks so residual cookies cannot drive CSRF mutations
 * without a trusted Origin + allowlisted CORS.
 */
export function enforceCookieRequestOrigin(
  allowedOrigins: string[],
): (req: Request, res: Response, next: NextFunction) => void {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    if (
      process.env.NODE_ENV !== 'production' ||
      SAFE_METHODS.has(req.method) ||
      !req.headers.cookie?.split(';').some((part) => {
        const cookie = part.trim();
        return (
          cookie.startsWith('nexa_access=') ||
          cookie.startsWith('nexa_refresh=')
        );
      })
    ) {
      next();
      return;
    }
    const origin = req.headers.origin;
    if (typeof origin !== 'string' || !allowed.has(origin)) {
      res.status(403).json({ message: 'Untrusted browser request origin' });
      return;
    }
    next();
  };
}
