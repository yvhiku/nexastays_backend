import {
  DEV_DEFAULT_CORS_ORIGINS,
  resolveCorsAllowlist,
  resolveNexaStage,
} from './cors-origins';

describe('CORS allowlist SEC-005', () => {
  const orig = { ...process.env };

  afterEach(() => {
    process.env = { ...orig };
  });

  it('resolves stages from NEXA_ENV / APP_ENV / NODE_ENV', () => {
    expect(resolveNexaStage({ NEXA_ENV: 'staging' } as NodeJS.ProcessEnv)).toBe(
      'staging',
    );
    expect(resolveNexaStage({ NEXA_ENV: 'dogfood' } as NodeJS.ProcessEnv)).toBe(
      'dogfood',
    );
    expect(
      resolveNexaStage({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    ).toBe('production');
    expect(resolveNexaStage({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe(
      'development',
    );
  });

  it('requires explicit CORS_ORIGINS for staging, dogfood, and production', () => {
    expect(() =>
      resolveCorsAllowlist({
        NEXA_ENV: 'staging',
        CORS_ORIGINS: '',
      } as NodeJS.ProcessEnv),
    ).toThrow(/CORS_ORIGINS/);
    expect(() =>
      resolveCorsAllowlist({
        NEXA_ENV: 'dogfood',
        CORS_ORIGINS: '',
      } as NodeJS.ProcessEnv),
    ).toThrow(/CORS_ORIGINS/);
    expect(() =>
      resolveCorsAllowlist({
        NODE_ENV: 'production',
        CORS_ORIGINS: '',
      } as NodeJS.ProcessEnv),
    ).toThrow(/CORS_ORIGINS/);
  });

  it('returns configured allowlist for staging', () => {
    expect(
      resolveCorsAllowlist({
        NEXA_ENV: 'staging',
        CORS_ORIGINS: 'https://staging.example.com,https://admin.staging.example.com',
      } as NodeJS.ProcessEnv),
    ).toEqual([
      'https://staging.example.com',
      'https://admin.staging.example.com',
    ]);
  });

  it('preserves production allowlist', () => {
    expect(
      resolveCorsAllowlist({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://nexastays.ma,https://admin.nexastays.ma',
      } as NodeJS.ProcessEnv),
    ).toEqual(['https://nexastays.ma', 'https://admin.nexastays.ma']);
  });

  it('rejects credentialed wildcard CORS', () => {
    expect(() =>
      resolveCorsAllowlist({
        NEXA_ENV: 'production',
        CORS_ORIGINS: '*',
      } as NodeJS.ProcessEnv),
    ).toThrow(/wildcard|\*/);
    expect(() =>
      resolveCorsAllowlist({
        NEXA_ENV: 'dogfood',
        CORS_ORIGINS: 'https://web.example,*',
      } as NodeJS.ProcessEnv),
    ).toThrow(/wildcard|\*/);
  });

  it('uses local defaults in development when CORS_ORIGINS unset', () => {
    expect(
      resolveCorsAllowlist({
        NODE_ENV: 'development',
        CORS_ORIGINS: '',
      } as NodeJS.ProcessEnv),
    ).toEqual(DEV_DEFAULT_CORS_ORIGINS);
  });

  it('never returns origin:true boolean', () => {
    const list = resolveCorsAllowlist({
      NODE_ENV: 'development',
    } as NodeJS.ProcessEnv);
    expect(Array.isArray(list)).toBe(true);
    expect(list.includes('http://evil.example')).toBe(false);
  });
});
