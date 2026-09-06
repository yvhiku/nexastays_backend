/**
 * Dogfood / production fail-closed env policy (Phase 1 + Phase 2A gates).
 * Extracted for unit tests — call from bootstrap.
 *
 * Demo OTP, Sumsub sandbox, and EMI mock remain available for development/dogfood.
 * Real production (NEXA_ENV=production) must never silently use those modes.
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
  const demoCode = (env.DEMO_OTP_CODE ?? '').trim();
  if (!demoCode) return;
  if (!/^\d{6}$/.test(demoCode)) {
    throw new Error('DEMO_OTP_CODE must contain exactly 6 digits.');
  }
  if (env.NODE_ENV === 'production' && env.NEXA_ENV !== 'dogfood') {
    throw new Error(
      'DEMO_OTP_CODE is allowed only when NEXA_ENV=dogfood; it is forbidden in staging and production.',
    );
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

export type SumsubMode = 'sandbox' | 'live';

/** Explicit Sumsub environment — sandbox for dogfood/dev; live required for real production. */
export function getSumsubMode(env: NodeJS.ProcessEnv = process.env): SumsubMode {
  const raw = (env.SUMSUB_MODE ?? '').trim().toLowerCase();
  if (raw === 'live' || raw === 'sandbox') return raw;
  const stage = resolveNexaStage(env);
  return stage === 'production' ? 'live' : 'sandbox';
}

/**
 * Real production must not run Sumsub sandbox mode.
 * Dogfood/dev may set SUMSUB_MODE=sandbox explicitly.
 */
export function assertSumsubModePolicy(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const stage = resolveNexaStage(env);
  const explicit = (env.SUMSUB_MODE ?? '').trim().toLowerCase();
  if (stage !== 'production') return;

  if (explicit === 'sandbox') {
    throw new Error(
      'SUMSUB_MODE=sandbox is not allowed when NEXA_ENV=production. Use SUMSUB_MODE=live with production Sumsub credentials.',
    );
  }
  if (explicit && explicit !== 'live') {
    throw new Error(
      `Unsupported SUMSUB_MODE="${explicit}". Allowed: sandbox | live.`,
    );
  }
  if (!explicit) {
    throw new Error(
      'NEXA_ENV=production requires SUMSUB_MODE=live explicitly set (no silent sandbox default).',
    );
  }
}

/**
 * Wallet EMI mock is for local/dogfood only. Real production must not use mock EMI.
 * Set EMI_PROVIDER_TYPE=disabled when wallet top-up is not offered in production yet.
 * Does not delete mock provider code — only rejects the combination at boot.
 */
export function assertEmiProviderPolicy(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const stage = resolveNexaStage(env);
  if (stage !== 'production') return;

  const explicit = (env.EMI_PROVIDER_TYPE ?? '').trim().toLowerCase();
  if (!explicit) {
    throw new Error(
      'NEXA_ENV=production requires EMI_PROVIDER_TYPE explicitly set ' +
        '(real provider name, or "disabled" if wallet top-up is not offered). ' +
        'Silent default mock is forbidden.',
    );
  }
  if (explicit === 'mock') {
    throw new Error(
      'EMI_PROVIDER_TYPE=mock is not allowed when NEXA_ENV=production. ' +
        'Use a real EMI provider, EMI_PROVIDER_TYPE=disabled, or NEXA_ENV=dogfood for mock top-up.',
    );
  }
}

/** Bundle used at Identity boot when NODE_ENV=production. */
export function assertIdentityProductionEnvPolicy(
  env: NodeJS.ProcessEnv = process.env,
): void {
  assertDemoOtpForbiddenInProduction(env);
  assertSumsubModePolicy(env);
  assertEmiProviderPolicy(env);
  if (env.NODE_ENV !== 'production') return;
  assertNoInsecureProductionSecrets(env);
  assertNoLoopbackProductionServiceUrls(env);
  void resolveNexaStage(env);
}
