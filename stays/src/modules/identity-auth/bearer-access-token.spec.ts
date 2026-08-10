import { extractBearerAccessToken } from './bearer-access-token';
import type { Request } from 'express';

describe('Stays Bearer access extraction PROD-SEC-001', () => {
  it('accepts Authorization Bearer', () => {
    const req = {
      headers: { authorization: 'Bearer abc.def.ghi' },
    } as Request;
    expect(extractBearerAccessToken(req)).toBe('abc.def.ghi');
  });

  it('rejects ambient nexa_access cookie alone', () => {
    const req = {
      headers: {
        cookie: 'nexa_access=stolen.access.token; nexa_refresh=r',
      },
    } as Request;
    expect(extractBearerAccessToken(req)).toBeNull();
  });

  it('ignores cookie even when Bearer absent', () => {
    const req = {
      headers: { cookie: 'nexa_access=only.cookie.token' },
    } as Request;
    expect(extractBearerAccessToken(req)).toBeNull();
  });
});
