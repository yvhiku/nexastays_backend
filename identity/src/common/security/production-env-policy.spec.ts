import {
  assertDemoOtpForbiddenInProduction,
  assertEmiProviderPolicy,
  assertIdentityProductionEnvPolicy,
  assertNoInsecureProductionSecrets,
  assertNoLoopbackProductionServiceUrls,
  assertSumsubModePolicy,
  getSumsubMode,
} from './production-env-policy';

describe('Identity production-env-policy Phase 1 + 2A', () => {
  it('rejects DEMO_OTP_CODE in a production release', () => {
    expect(() =>
      assertDemoOtpForbiddenInProduction({
        NODE_ENV: 'production',
        NEXA_ENV: 'production',
        DEMO_OTP_CODE: '123456',
      } as NodeJS.ProcessEnv),
    ).toThrow(/DEMO_OTP_CODE/);
  });

  it('allows DEMO_OTP_CODE for dogfood with production Node hardening', () => {
    expect(() =>
      assertDemoOtpForbiddenInProduction({
        NODE_ENV: 'production',
        NEXA_ENV: 'dogfood',
        DEMO_OTP_CODE: '123456',
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
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
        SUMSUB_MODE: 'sandbox',
        EMI_PROVIDER_TYPE: 'mock',
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('SUMSUB_MODE sandbox allowed in dogfood; live required in production', () => {
    expect(getSumsubMode({ NEXA_ENV: 'dogfood' } as NodeJS.ProcessEnv)).toBe(
      'sandbox',
    );
    expect(() =>
      assertSumsubModePolicy({
        NEXA_ENV: 'dogfood',
        SUMSUB_MODE: 'sandbox',
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
    expect(() =>
      assertSumsubModePolicy({
        NEXA_ENV: 'production',
        SUMSUB_MODE: 'sandbox',
      } as NodeJS.ProcessEnv),
    ).toThrow(/sandbox/);
    expect(() =>
      assertSumsubModePolicy({
        NEXA_ENV: 'production',
      } as NodeJS.ProcessEnv),
    ).toThrow(/SUMSUB_MODE=live/);
    expect(() =>
      assertSumsubModePolicy({
        NEXA_ENV: 'production',
        SUMSUB_MODE: 'live',
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('EMI mock forbidden in production; disabled allowed', () => {
    expect(() =>
      assertEmiProviderPolicy({
        NEXA_ENV: 'production',
        EMI_PROVIDER_TYPE: 'mock',
      } as NodeJS.ProcessEnv),
    ).toThrow(/mock/);
    expect(() =>
      assertEmiProviderPolicy({
        NEXA_ENV: 'production',
      } as NodeJS.ProcessEnv),
    ).toThrow(/explicitly/);
    expect(() =>
      assertEmiProviderPolicy({
        NEXA_ENV: 'production',
        EMI_PROVIDER_TYPE: 'disabled',
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
    expect(() =>
      assertEmiProviderPolicy({
        NEXA_ENV: 'dogfood',
        EMI_PROVIDER_TYPE: 'mock',
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });
});
