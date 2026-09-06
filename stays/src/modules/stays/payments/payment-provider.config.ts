/**
 * Soft-launch vs real-production payment provider policy (PROD-OPS-002).
 *
 * DOGFOOD: mock allowed (soft launch / dogfood).
 * STAGING: mock allowed only when STAYS_PAYMENT_PROVIDER=mock is set explicitly
 *          (defaulting via unset is rejected so staging cannot accidentally inherit).
 * PRODUCTION (real): requires STAYS_PAYMENT_PROVIDER=cmi explicitly; mock rejected.
 * DEVELOPMENT: mock allowed (local).
 *
 * Mock and CMI are separate modes — never silently fall back from cmi→mock.
 */

import { resolveNexaStage } from '../../../common/security/cors-origins';
import { urlLooksLikeLoopback } from '../../../common/security/production-env-policy';

export function getStaysPaymentProvider(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (env.STAYS_PAYMENT_PROVIDER ?? 'mock').trim().toLowerCase();
}

export function isMockPaymentProvider(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return getStaysPaymentProvider(env) === 'mock';
}

/** Host payout settlement rails — never auto-enabled. */
export function isHostPayoutEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (env.STAYS_HOST_PAYOUT_ENABLED ?? '').trim().toLowerCase() === 'true';
}

/**
 * Fail closed for unsafe stage/provider combinations.
 * Throws if the combination is unsafe.
 */
export function assertPaymentProviderPolicy(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const stage = resolveNexaStage(env);
  const provider = getStaysPaymentProvider(env);
  const explicitProvider = (env.STAYS_PAYMENT_PROVIDER ?? '').trim().toLowerCase();

  if (provider === 'cmi') {
    assertCmiCredentials(env);
    return;
  }

  if (provider !== 'mock') {
    throw new Error(
      `Unsupported STAYS_PAYMENT_PROVIDER="${provider}". Allowed: mock | cmi.`,
    );
  }

  // Mock path — never allowed as silent default in production.
  if (stage === 'development' || stage === 'dogfood') {
    return;
  }

  if (stage === 'staging') {
    if (explicitProvider !== 'mock') {
      throw new Error(
        'Staging with mock payments requires STAYS_PAYMENT_PROVIDER=mock explicitly set (no silent default).',
      );
    }
    return;
  }

  // stage === production (real public production)
  if (explicitProvider !== 'cmi') {
    throw new Error(
      'NEXA_ENV=production requires STAYS_PAYMENT_PROVIDER=cmi explicitly set. ' +
        'Mock payments are only for development/dogfood/staging (explicit mock). ' +
        'Use NEXA_ENV=dogfood for soft-launch mock payments.',
    );
  }
}

function assertCmiCredentials(env: NodeJS.ProcessEnv): void {
  const clientId = (env.CMI_CLIENT_ID ?? '').trim();
  const storeKey = (env.CMI_STORE_KEY ?? '').trim();
  if (!clientId || !storeKey) {
    throw new Error(
      'STAYS_PAYMENT_PROVIDER=cmi requires CMI_CLIENT_ID and CMI_STORE_KEY (no silent mock fallback).',
    );
  }

  const urlKeys = [
    'CMI_PAYMENT_URL',
    'CMI_API_URL',
    'CMI_CALLBACK_URL',
    'CMI_OK_URL',
    'CMI_FAIL_URL',
    'STAYS_PUBLIC_URL',
    'STAYS_WEB_URL',
  ] as const;

  for (const key of urlKeys) {
    const raw = (env[key] ?? '').trim();
    if (!raw) continue;
    if (urlLooksLikeLoopback(raw)) {
      throw new Error(
        `${key} must not use a loopback host when STAYS_PAYMENT_PROVIDER=cmi.`,
      );
    }
  }

  // Production stage must not rely on unset public URLs falling back to localhost helpers.
  const stage = resolveNexaStage(env);
  if (stage === 'production') {
    for (const key of ['CMI_CALLBACK_URL', 'STAYS_PUBLIC_URL', 'STAYS_WEB_URL'] as const) {
      if (!(env[key] ?? '').trim()) {
        throw new Error(
          `${key} is required when NEXA_ENV=production and STAYS_PAYMENT_PROVIDER=cmi.`,
        );
      }
    }
  }
}

/**
 * Legacy unauthenticated mock webhook — local dev / automated tests only.
 * Never enabled when NODE_ENV=production regardless of payment provider.
 */
export function isLegacyMockWebhookEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NODE_ENV === 'production') {
    return false;
  }
  if (!isMockPaymentProvider(env)) {
    return false;
  }
  return env.ALLOW_LEGACY_MOCK_WEBHOOK === 'true';
}
