import {
  DEV_DEFAULT_CORS_ORIGINS,
  resolveCorsAllowlist,
  resolveNexaStage,
} from './cors-origins';

describe('Stays CORS allowlist SEC-005', () => {
  it('rejects missing staging or dogfood allowlist', () => {
    expect(() =>
      resolveCorsAllowlist({
        NEXA_ENV: 'staging',
      } as NodeJS.ProcessEnv),
    ).toThrow(/CORS_ORIGINS/);
    expect(() =>
      resolveCorsAllowlist({
        NEXA_ENV: 'dogfood',
      } as NodeJS.ProcessEnv),
    ).toThrow(/CORS_ORIGINS/);
  });

  it('allows configured origin only', () => {
    const list = resolveCorsAllowlist({
      NEXA_ENV: 'staging',
      CORS_ORIGINS: 'https://web.staging.nexa.test',
    } as NodeJS.ProcessEnv);
    expect(list).toContain('https://web.staging.nexa.test');
    expect(list).not.toContain('https://evil.example');
  });

  it('rejects credentialed wildcard CORS', () => {
    expect(() =>
      resolveCorsAllowlist({
        NODE_ENV: 'production',
        CORS_ORIGINS: '*',
      } as NodeJS.ProcessEnv),
    ).toThrow(/wildcard|\*/);
  });

  it('development defaults are controlled', () => {
    expect(resolveNexaStage({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(
      'development',
    );
    expect(
      resolveCorsAllowlist({ NODE_ENV: 'development' } as NodeJS.ProcessEnv),
    ).toEqual(DEV_DEFAULT_CORS_ORIGINS);
  });
});
