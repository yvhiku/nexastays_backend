import {
  getJwtAdminExpiresIn,
  getJwtAudience,
  getJwtIssuer,
} from './jwt-claims';

describe('JWT claims SEC-006', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('uses configured issuer and audience', () => {
    process.env.JWT_ISSUER = 'https://identity.example/api/v1';
    process.env.JWT_AUDIENCE = 'nexa-platform';
    expect(getJwtIssuer()).toBe('https://identity.example/api/v1');
    expect(getJwtAudience()).toBe('nexa-platform');
  });

  it('requires issuer/audience in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
    expect(() => getJwtIssuer()).toThrow(/JWT_ISSUER/);
    expect(() => getJwtAudience()).toThrow(/JWT_AUDIENCE/);
  });

  it('defaults issuer/audience in non-production', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
    expect(getJwtIssuer()).toBe('http://127.0.0.1:3001/api/v1');
    expect(getJwtAudience()).toBe('nexa-platform');
  });

  it('defaults admin TTL shorter than typical access', () => {
    delete process.env.JWT_ADMIN_EXPIRES_IN;
    expect(getJwtAdminExpiresIn()).toBe('5m');
  });
});
