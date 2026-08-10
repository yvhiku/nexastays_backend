import { getReleaseMetadata } from './release-metadata';

describe('stays getReleaseMetadata', () => {
  it('exposes sha without secrets', () => {
    const meta = getReleaseMetadata({
      NEXA_SERVICE_NAME: 'nexa-stays',
      GIT_SHA: 'abc',
      STAYS_PAYMENT_PROVIDER: 'mock',
      DB_PASSWORD: 'nope',
    } as NodeJS.ProcessEnv);
    expect(meta.git_sha).toBe('abc');
    expect(JSON.stringify(meta)).not.toMatch(/nope|mock/);
  });
});
