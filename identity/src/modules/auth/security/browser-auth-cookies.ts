import type { Request, Response } from 'express';
import { appConfig } from '../../../common/config/app.config';

/**
 * PROD-SEC-001 / ADR-005:
 * - Access JWT is NOT stored in a cookie for browser clients (memory + Bearer only).
 * - Refresh may use HttpOnly `nexa_refresh`.
 * - `nexa_access` is only cleared for legacy sessions; it is never set for new logins.
 */
export const ACCESS_COOKIE = 'nexa_access';
export const REFRESH_COOKIE = 'nexa_refresh';
export const BROWSER_AUTH_HEADER = 'x-auth-transport';

/** Clients use this when the refresh credential should be HttpOnly-set (web/dashboard). */
export function isBrowserCookieRequest(req: Request): boolean {
  return req.headers[BROWSER_AUTH_HEADER] === 'cookie';
}

export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return undefined;
}

function cookieDomain(): string | undefined {
  const configured = process.env.AUTH_COOKIE_DOMAIN?.trim();
  return configured || undefined;
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    domain: cookieDomain(),
    path: '/',
    maxAge,
  };
}

/**
 * Sets the refresh cookie only. Never issues ambient `nexa_access`.
 * Clears any legacy access cookie so it cannot remain ambient.
 */
export function setBrowserAuthCookies(
  res: Response,
  tokens: { access_token: string; refresh_token?: string },
): void {
  // Drop legacy ambient access cookie on every successful cookie-transport auth.
  res.clearCookie(ACCESS_COOKIE, cookieOptions(0));
  void tokens.access_token; // access stays in JSON body for in-memory Bearer use

  if (tokens.refresh_token) {
    res.cookie(
      REFRESH_COOKIE,
      tokens.refresh_token,
      cookieOptions(appConfig.refreshTokenExpiresIn * 1000),
    );
  }
}

export function clearBrowserAuthCookies(res: Response): void {
  const options = cookieOptions(0);
  res.clearCookie(ACCESS_COOKIE, options);
  res.clearCookie(REFRESH_COOKIE, options);
}

/** Production cookie flag contract used by tests/docs (PROD-SEC-001). */
export function getBrowserRefreshCookieSecurityFlags(
  env: NodeJS.ProcessEnv = process.env,
): { httpOnly: true; secure: boolean; sameSite: 'lax' } {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
  };
}
