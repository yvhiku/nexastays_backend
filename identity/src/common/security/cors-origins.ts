/**
 * Stage-aware CORS allowlisting (SEC-005).
 * Never use origin:true with credentials for shared staging.
 */

export type NexaStage = 'production' | 'staging' | 'development';

export function resolveNexaStage(
  env: NodeJS.ProcessEnv = process.env,
): NexaStage {
  const explicit = (env.NEXA_ENV || env.APP_ENV || '').trim().toLowerCase();
  if (explicit === 'production' || explicit === 'staging' || explicit === 'development') {
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

/** Default browser origins for isolated local development only. */
export const DEV_DEFAULT_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3003',
  'http://127.0.0.1:3003',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];

/**
 * Returns explicit origin allowlist. Never returns `true` (reflect-any).
 */
export function resolveCorsAllowlist(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const stage = resolveNexaStage(env);
  const configured = parseCorsOriginsList(env);

  if (stage === 'production' || stage === 'staging') {
    if (configured.length === 0) {
      throw new Error(
        `CORS_ORIGINS must be set for ${stage} (comma-separated trusted origins). Arbitrary Origin reflection is disabled.`,
      );
    }
    return configured;
  }

  // development: prefer explicit list; otherwise localhost defaults only
  return configured.length > 0 ? configured : [...DEV_DEFAULT_CORS_ORIGINS];
}
