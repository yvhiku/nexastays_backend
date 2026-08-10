import type { Request, Response } from 'express';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  getBrowserRefreshCookieSecurityFlags,
  isBrowserCookieRequest,
  readCookie,
  setBrowserAuthCookies,
} from './browser-auth-cookies';

describe('browser authentication cookies PROD-SEC-001', () => {
  it('reads only the requested cookie', () => {
    const request = {
      headers: { cookie: `other=1; ${REFRESH_COOKIE}=signed%20token` },
    } as Request;
    expect(readCookie(request, REFRESH_COOKIE)).toBe('signed token');
  });

  it('requires an explicit cookie transport header', () => {
    expect(
      isBrowserCookieRequest({
        headers: { 'x-auth-transport': 'cookie' },
      } as unknown as Request),
    ).toBe(true);
  });

  it('sets refresh cookie and clears ambient access cookie — never sets nexa_access', () => {
    const cleared: string[] = [];
    const set: Array<{ name: string; value: string }> = [];
    const res = {
      clearCookie: (name: string) => {
        cleared.push(name);
      },
      cookie: (name: string, value: string) => {
        set.push({ name, value });
      },
    } as unknown as Response;

    setBrowserAuthCookies(res, {
      access_token: 'access.jwt.value',
      refresh_token: 'refresh.plain',
    });

    expect(cleared).toContain(ACCESS_COOKIE);
    expect(set.some((c) => c.name === ACCESS_COOKIE)).toBe(false);
    expect(set).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: REFRESH_COOKIE,
          value: 'refresh.plain',
        }),
      ]),
    );
  });

  it('production refresh cookie flags are HttpOnly Secure SameSite=Lax', () => {
    expect(
      getBrowserRefreshCookieSecurityFlags({ NODE_ENV: 'production' }),
    ).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
    });
  });
});
