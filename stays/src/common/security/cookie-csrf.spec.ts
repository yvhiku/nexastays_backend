import type { NextFunction, Request, Response } from 'express';
import { enforceCookieRequestOrigin } from './cookie-csrf';

describe('cookie request origin enforcement', () => {
  const previousNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv;
  });

  it('rejects an untrusted cookie-authenticated write', () => {
    process.env.NODE_ENV = 'production';
    const status = jest.fn().mockReturnThis();
    const next = jest.fn() as NextFunction;
    enforceCookieRequestOrigin(['https://www.nexastays.ma'])(
      {
        method: 'PATCH',
        headers: {
          cookie: 'nexa_access=token',
          origin: 'https://evil.example',
        },
      } as unknown as Request,
      { status, json: jest.fn() } as unknown as Response,
      next,
    );
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
