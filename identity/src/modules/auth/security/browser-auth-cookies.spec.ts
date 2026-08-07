import type { Request } from 'express';
import {
  ACCESS_COOKIE,
  isBrowserCookieRequest,
  readCookie,
} from './browser-auth-cookies';

describe('browser authentication cookies', () => {
  it('reads only the requested cookie', () => {
    const request = {
      headers: { cookie: `other=1; ${ACCESS_COOKIE}=signed%20token` },
    } as Request;
    expect(readCookie(request, ACCESS_COOKIE)).toBe('signed token');
  });

  it('requires an explicit cookie transport header', () => {
    expect(
      isBrowserCookieRequest({
        headers: { 'x-auth-transport': 'cookie' },
      } as unknown as Request),
    ).toBe(true);
  });
});
