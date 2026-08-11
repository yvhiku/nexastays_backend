/**
 * Nexa deployment stage contract (PROD-OPS-002).
 * Keep in sync with identity/src/common/security/cors-origins.ts.
 */

export type NexaStage =
  | 'development'
  | 'dogfood'
  | 'staging'
  | 'production';

export function resolveNexaStage(
  env: NodeJS.ProcessEnv = process.env,
): NexaStage {
  const explicit = (env.NEXA_ENV || env.APP_ENV || '').trim().toLowerCase();
  if (
    explicit === 'production' ||
    explicit === 'staging' ||
    explicit === 'dogfood' ||
    explicit === 'development'
  ) {
    return explicit;
  }
  if (env.NODE_ENV === 'production') return 'production';
  return 'development';
}

export function parseCorsOriginsList(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return (env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const DEV_DEFAULT_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3003',
  'http://127.0.0.1:3003',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:3005',
  'http://127.0.0.1:3005',
];

/**
 * Credentials are always enabled on Stays. Reject wildcard / null origins
 * whenever CORS_ORIGINS is explicitly configured (any stage).
 */
export function assertNoCredentialedWildcardCors(
  origins: string[],
): void {
  for (const origin of origins) {
    const o = origin.trim();
    if (o === '*' || o.toLowerCase() === 'null') {
      throw new Error(
        'CORS_ORIGINS must not contain "*" or "null" when credentials are enabled.',
      );
    }
  }
}

export function resolveCorsAllowlist(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const stage = resolveNexaStage(env);
  const configured = parseCorsOriginsList(env);

  if (stage === 'production' || stage === 'staging' || stage === 'dogfood') {
    if (configured.length === 0) {
      throw new Error(
        `CORS_ORIGINS must be set for ${stage} (comma-separated trusted origins). Arbitrary Origin reflection is disabled.`,
      );
    }
    assertNoCredentialedWildcardCors(configured);
    return configured;
  }

  const list =
    configured.length > 0 ? configured : [...DEV_DEFAULT_CORS_ORIGINS];
  assertNoCredentialedWildcardCors(configured);
  return list;
}
