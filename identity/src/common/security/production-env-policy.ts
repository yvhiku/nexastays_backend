/**
 * Dogfood / production fail-closed env policy (Phase 1).
 * Extracted for unit tests — call from bootstrap; do not invent new env vars.
 */

import { resolveNexaStage } from './cors-origins';

const KNOWN_INSECURE_VALUES = new Set([
  'dev-internal-key',
  'nexa_identity_dev',
  'nexa_stays_dev',
  'dev-only-secret-not-for-production',
  'dev-otp-pepper-not-for-production',
  'dev-refresh-pepper-not-for-production',
  'CHANGE_ME',
  'REPLACE',
  'REPLACE_STRONG_PASSWORD',
  'dev',
]);

export function assertDemoOtpForbiddenInProduction(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV === 'production' && (env.DEMO_OTP_CODE ?? '').trim()) {
    throw new Error('DEMO_OTP_CODE must not be set in production.');
  }
}

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

/**
 * When NODE_ENV=production (dogfood VPS contract included), reject known
 * development/placeholder secret values that were explicitly configured.
 * Missing required secrets are enforced elsewhere.
 */
export function assertNoInsecureProductionSecrets(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== 'production') return;

  const checks: Array<[string, string | undefined]> = [
    ['INTERNAL_SERVICE_KEY', env.INTERNAL_SERVICE_KEY],
    ['DB_PASSWORD', env.DB_PASSWORD],
    ['JWT_SECRET', env.JWT_SECRET],
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

/**
 * Service URLs must not silently point at loopback on production Node
 * (includes dogfood VPS with NODE_ENV=production).
 */
export function assertNoLoopbackProductionServiceUrls(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== 'production') return;

  const keys = [
    'JWT_ISSUER',
    'IDENTITY_BASE_URL',
    'IDENTITY_JWKS_URL',
    'STAYS_API_BASE_URL',
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

/** Bundle used at Identity boot when NODE_ENV=production. */
export function assertIdentityProductionEnvPolicy(
  env: NodeJS.ProcessEnv = process.env,
): void {
  assertDemoOtpForbiddenInProduction(env);
  if (env.NODE_ENV !== 'production') return;
  assertNoInsecureProductionSecrets(env);
  assertNoLoopbackProductionServiceUrls(env);
  // Documented posture: dogfood may use Sumsub sandbox; live KYC is not enforced here.
  void resolveNexaStage(env);
}
