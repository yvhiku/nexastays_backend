/**
 * Dogfood / production fail-closed env policy (Phase 1).
 * Keep aligned with identity/src/common/security/production-env-policy.ts.
 */

const KNOWN_INSECURE_VALUES = new Set([
  'dev-internal-key',
  'nexa_identity_dev',
  'nexa_stays_dev',
  'dev-only-secret-not-for-production',
  'CHANGE_ME',
  'REPLACE',
  'REPLACE_STRONG_PASSWORD',
  'dev',
]);

function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

export function urlLooksLikeLoopback(raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;
  try {
    return isLoopbackHostname(new URL(value).hostname);
  } catch {
    return /(?:^|[/:])(?:localhost|127\.0\.0\.1|::1)(?:$|[/:?#])/i.test(value);
  }
}

export function assertNoInsecureProductionSecrets(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== 'production') return;

  const checks: Array<[string, string | undefined]> = [
    ['INTERNAL_SERVICE_KEY', env.INTERNAL_SERVICE_KEY],
    ['DB_PASSWORD', env.DB_PASSWORD],
  ];

  for (const [name, raw] of checks) {
    const value = (raw ?? '').trim();
    if (!value) continue;
    if (
      KNOWN_INSECURE_VALUES.has(value) ||
      /^nexa_(identity|stays)_dev$/i.test(value)
    ) {
      throw new Error(
        `${name} uses a known development/default value which is forbidden when NODE_ENV=production.`,
      );
    }
  }
}

export function assertNoLoopbackProductionServiceUrls(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== 'production') return;

  const keys = [
    'JWT_ISSUER',
    'IDENTITY_BASE_URL',
    'IDENTITY_JWKS_URL',
    'STAYS_PUBLIC_URL',
    'STAYS_WEB_URL',
    'STAYS_API_PUBLIC_URL',
  ] as const;

  for (const key of keys) {
    const raw = (env[key] ?? '').trim();
    if (!raw) continue;
    if (urlLooksLikeLoopback(raw)) {
      throw new Error(
        `${key} must not use a loopback host (localhost / 127.0.0.1 / ::1) when NODE_ENV=production.`,
      );
    }
  }
}

export function assertStaysProductionEnvPolicy(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== 'production') return;
  assertNoInsecureProductionSecrets(env);
  assertNoLoopbackProductionServiceUrls(env);
}
