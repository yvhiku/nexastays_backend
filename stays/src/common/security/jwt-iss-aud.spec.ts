import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { getJwtAudience, getJwtIssuer } from './jwt-claims';

describe('Stays JWT iss/aud verification SEC-006', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const issuer = 'http://127.0.0.1:3001/api/v1';
  const audience = 'nexa-platform';

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_ISSUER = issuer;
    process.env.JWT_AUDIENCE = audience;
  });

  it('accepts matching claims and rejects wrong aud', () => {
    const ok = jwt.sign(
      { sub: 'u1', account_type: 'HOST' },
      privateKey,
      { algorithm: 'RS256', expiresIn: '15m', issuer, audience },
    );
    expect(
      jwt.verify(ok, publicKey, {
        algorithms: ['RS256'],
        issuer: getJwtIssuer(),
        audience: getJwtAudience(),
      }),
    ).toMatchObject({ sub: 'u1' });

    const badAud = jwt.sign(
      { sub: 'u1' },
      privateKey,
      {
        algorithm: 'RS256',
        expiresIn: '15m',
        issuer,
        audience: 'wrong',
      },
    );
    expect(() =>
      jwt.verify(badAud, publicKey, {
        algorithms: ['RS256'],
        issuer: getJwtIssuer(),
        audience: getJwtAudience(),
      }),
    ).toThrow(/audience/i);
  });
});
