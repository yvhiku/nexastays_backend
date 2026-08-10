import { getReleaseMetadata } from './release-metadata';

describe('getReleaseMetadata', () => {
  it('exposes sha/version without secrets', () => {
    const meta = getReleaseMetadata({
      NEXA_SERVICE_NAME: 'nexa-identity',
      NEXA_ENV: 'staging',
      NODE_ENV: 'production',
      GIT_SHA: 'deadbeef',
      BUILD_VERSION: '1.0.0',
      IMAGE_TAG: 'deadbeef',
      JWT_PRIVATE_KEY: 'SHOULD_NOT_APPEAR',
    } as NodeJS.ProcessEnv);
    expect(meta.git_sha).toBe('deadbeef');
    expect(meta.nexa_env).toBe('staging');
    expect(JSON.stringify(meta)).not.toContain('SHOULD_NOT_APPEAR');
  });
});
