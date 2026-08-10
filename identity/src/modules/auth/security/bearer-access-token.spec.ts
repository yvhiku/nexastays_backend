import { extractBearerAccessToken } from './bearer-access-token';
import type { Request } from 'express';

describe('Identity Bearer access extraction PROD-SEC-001', () => {
  it('accepts Bearer and rejects ambient access cookie', () => {
    expect(
      extractBearerAccessToken({
        headers: { authorization: 'Bearer tok' },
      } as Request),
    ).toBe('tok');
    expect(
      extractBearerAccessToken({
        headers: { cookie: 'nexa_access=ambient' },
      } as Request),
    ).toBeNull();
  });
});
