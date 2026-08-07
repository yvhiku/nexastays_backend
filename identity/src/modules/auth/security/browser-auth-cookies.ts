import type { Request, Response } from 'express';
import { appConfig } from '../../../common/config/app.config';

export const ACCESS_COOKIE = 'nexa_access';
export const REFRESH_COOKIE = 'nexa_refresh';
export const BROWSER_AUTH_HEADER = 'x-auth-transport';

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

export function setBrowserAuthCookies(
  res: Response,
  tokens: { access_token: string; refresh_token?: string },
): void {
  res.cookie(
    ACCESS_COOKIE,
    tokens.access_token,
    cookieOptions(15 * 60 * 1000),
  );
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
