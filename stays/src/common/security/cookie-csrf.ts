import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Origin gate for cookie-bearing mutations (PROD-SEC-001).
 * Stays protected APIs use Bearer — not ambient access cookies.
 * This still guards refresh leftovers / legacy nexa_access if present.
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
