import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { getJwtAudience, getJwtIssuer } from './jwt-claims';

/**
 * SEC-006 verification contract — mirrors Identity + Stays passport-jwt options:
 * algorithms RS256, issuer, audience must all match.
 */
describe('JWT iss/aud verification SEC-006', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  const issuer = 'http://127.0.0.1:3001/api/v1';
  const audience = 'nexa-platform';

  beforeAll(() => {
    process.env.JWT_ISSUER = issuer;
    process.env.JWT_AUDIENCE = audience;
    process.env.NODE_ENV = 'test';
  });

  function sign(payload: object, opts: jwt.SignOptions = {}) {
    return jwt.sign(payload, privateKey, {
      algorithm: 'RS256',
      expiresIn: '15m',
      issuer,
      audience,
      ...opts,
    });
  }

  function verify(token: string, opts: jwt.VerifyOptions = {}) {
    return jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: getJwtIssuer(),
      audience: getJwtAudience(),
      ...opts,
    });
  }

  it('accepts valid RS256 JWT with correct iss/aud', () => {
    const token = sign({ sub: 'u1', account_type: 'CONSUMER' });
    const decoded = verify(token) as jwt.JwtPayload;
    expect(decoded.sub).toBe('u1');
    expect(decoded.iss).toBe(issuer);
    expect(decoded.aud).toBe(audience);
  });

  it('rejects wrong issuer', () => {
    const token = sign(
      { sub: 'u1' },
      { issuer: 'https://other-identity.example' },
    );
    expect(() => verify(token)).toThrow(/issuer/i);
  });

  it('rejects wrong audience', () => {
    const token = sign({ sub: 'u1' }, { audience: 'other-service' });
    expect(() => verify(token)).toThrow(/audience/i);
  });

  it('rejects missing issuer', () => {
    const token = jwt.sign(
      { sub: 'u1', aud: audience },
      privateKey,
      { algorithm: 'RS256', expiresIn: '15m' },
    );
    expect(() => verify(token)).toThrow(/issuer/i);
  });

  it('rejects missing audience', () => {
    const token = jwt.sign(
      { sub: 'u1', iss: issuer },
      privateKey,
      { algorithm: 'RS256', expiresIn: '15m' },
    );
    expect(() => verify(token)).toThrow(/audience/i);
  });

  it('rejects wrong algorithm (HS256)', () => {
    const token = jwt.sign(
      { sub: 'u1' },
      'hmac-secret',
      { algorithm: 'HS256', expiresIn: '15m', issuer, audience },
    );
    expect(() => verify(token)).toThrow();
  });

  it('rejects expired token', () => {
    const token = sign({ sub: 'u1' }, { expiresIn: -10 });
    expect(() => verify(token)).toThrow(/expired/i);
  });

  it('rejects token for another environment issuer', () => {
    const token = sign(
      { sub: 'u1' },
      { issuer: 'https://identity.staging.example/api/v1' },
    );
    expect(() => verify(token)).toThrow(/issuer/i);
  });
});
