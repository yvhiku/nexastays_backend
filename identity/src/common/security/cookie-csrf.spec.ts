import type { NextFunction, Request, Response } from 'express';
import { enforceCookieRequestOrigin } from './cookie-csrf';

describe('cookie request origin enforcement', () => {
  const previousNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv;
  });

  function invoke(origin?: string) {
    process.env.NODE_ENV = 'production';
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const next = jest.fn() as NextFunction;
    const req = {
      method: 'POST',
      headers: {
        cookie: 'nexa_refresh=secret',
        ...(origin ? { origin } : {}),
      },
    } as unknown as Request;
    const res = { status, json } as unknown as Response;
    enforceCookieRequestOrigin(['https://www.nexastays.ma'])(req, res, next);
    return { status, next };
  }

  it('rejects a cookie-authenticated write without an approved origin', () => {
    expect(invoke().status).toHaveBeenCalledWith(403);
    expect(invoke('https://evil.example').status).toHaveBeenCalledWith(403);
  });

  it('allows an exact approved origin', () => {
    expect(invoke('https://www.nexastays.ma').next).toHaveBeenCalled();
  });
});
