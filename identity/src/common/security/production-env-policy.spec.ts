import {
  assertDemoOtpForbiddenInProduction,
  assertIdentityProductionEnvPolicy,
  assertNoInsecureProductionSecrets,
  assertNoLoopbackProductionServiceUrls,
} from './production-env-policy';

describe('Identity production-env-policy Phase 1', () => {
  it('rejects DEMO_OTP_CODE when NODE_ENV=production', () => {
    expect(() =>
      assertDemoOtpForbiddenInProduction({
        NODE_ENV: 'production',
        DEMO_OTP_CODE: '123456',
      } as NodeJS.ProcessEnv),
    ).toThrow(/DEMO_OTP_CODE/);
  });

  it('allows DEMO_OTP_CODE outside production', () => {
    expect(() =>
      assertDemoOtpForbiddenInProduction({
        NODE_ENV: 'development',
        DEMO_OTP_CODE: '123456',
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('rejects known-dev INTERNAL_SERVICE_KEY in production', () => {
    expect(() =>
      assertNoInsecureProductionSecrets({
        NODE_ENV: 'production',
        INTERNAL_SERVICE_KEY: 'dev-internal-key',
      } as NodeJS.ProcessEnv),
    ).toThrow(/INTERNAL_SERVICE_KEY/);
  });

  it('rejects loopback JWT_ISSUER in production', () => {
    expect(() =>
      assertNoLoopbackProductionServiceUrls({
        NODE_ENV: 'production',
        JWT_ISSUER: 'http://127.0.0.1:3001/api/v1',
      } as NodeJS.ProcessEnv),
    ).toThrow(/JWT_ISSUER/);
  });

  it('accepts dogfood NODE_ENV=production with strong non-loopback config', () => {
    expect(() =>
      assertIdentityProductionEnvPolicy({
        NODE_ENV: 'production',
        NEXA_ENV: 'dogfood',
        INTERNAL_SERVICE_KEY: 'strong-internal-key-not-dev',
        DB_PASSWORD: 'strong-db-pass-not-dev',
        JWT_ISSUER: 'https://identity.dogfood.example/api/v1',
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});
