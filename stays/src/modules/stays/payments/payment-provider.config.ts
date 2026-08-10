/**
 * Soft-launch vs real-production payment provider policy (PROD-OPS-002).
 *
 * DOGFOOD: mock allowed (soft launch / dogfood).
 * STAGING: mock allowed only when STAYS_PAYMENT_PROVIDER=mock is set explicitly
 *          (defaulting via unset is rejected so staging cannot accidentally inherit).
 * PRODUCTION (real): mock rejected.
 * DEVELOPMENT: mock allowed (local).
 *
 * CMI remains FUTURE — this does not enable real-money settlement.
 */

import { resolveNexaStage } from '../../../common/security/cors-origins';

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

/**
 * Fail closed for NODE_ENV=production + NEXA_ENV=production + mock.
 * Throws if the combination is unsafe.
 */
export function assertPaymentProviderPolicy(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const stage = resolveNexaStage(env);
  const provider = getStaysPaymentProvider(env);
  const explicitProvider = (env.STAYS_PAYMENT_PROVIDER ?? '').trim().toLowerCase();

  if (provider === 'cmi') {
    // Boot still requires CMI secrets elsewhere; no capture/payout claim here.
    return;
  }

  if (provider !== 'mock') {
    throw new Error(
      `Unsupported STAYS_PAYMENT_PROVIDER="${provider}". Allowed: mock | cmi.`,
    );
  }

  // Mock path
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
  throw new Error(
    'STAYS_PAYMENT_PROVIDER=mock is not allowed when NEXA_ENV=production. ' +
      'Use NEXA_ENV=dogfood for soft-launch mock payments, or set a real provider when live. CMI is FUTURE.',
  );
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
