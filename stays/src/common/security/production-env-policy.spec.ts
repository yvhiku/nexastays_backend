import {
  assertNoInsecureProductionSecrets,
  assertNoLoopbackProductionServiceUrls,
  assertStaysProductionEnvPolicy,
} from './production-env-policy';

describe('Stays production-env-policy Phase 1', () => {
  it('rejects known-dev DB_PASSWORD in production', () => {
    expect(() =>
      assertNoInsecureProductionSecrets({
        NODE_ENV: 'production',
        DB_PASSWORD: 'nexa_stays_dev',
      } as NodeJS.ProcessEnv),
    ).toThrow(/DB_PASSWORD/);
  });

  it('rejects loopback IDENTITY_BASE_URL in production', () => {
    expect(() =>
      assertNoLoopbackProductionServiceUrls({
        NODE_ENV: 'production',
        IDENTITY_BASE_URL: 'http://localhost:3001/api/v1',
      } as NodeJS.ProcessEnv),
    ).toThrow(/IDENTITY_BASE_URL/);
  });

  it('accepts dogfood production Node with strong non-loopback URLs', () => {
    expect(() =>
      assertStaysProductionEnvPolicy({
        NODE_ENV: 'production',
        NEXA_ENV: 'dogfood',
        INTERNAL_SERVICE_KEY: 'strong-internal-key-not-dev',
        DB_PASSWORD: 'strong-stays-pass-not-dev',
        IDENTITY_BASE_URL: 'https://identity.dogfood.example/api/v1',
        IDENTITY_JWKS_URL:
          'https://identity.dogfood.example/api/v1/.well-known/jwks.json',
        JWT_ISSUER: 'https://identity.dogfood.example/api/v1',
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});
