import { isProductionRuntime } from '../../common/security/secrets';

export type SmsProviderName = 'envoisms' | 'twilio' | 'none';

/** Explicit provider, else prefer EnvoiSMS when keyed, else Twilio. */
export function resolveSmsProvider(
  env: NodeJS.ProcessEnv = process.env,
): SmsProviderName {
  const explicit = (env.SMS_PROVIDER || '').trim().toLowerCase();
  if (explicit === 'envoisms' || explicit === 'twilio' || explicit === 'none') {
    return explicit;
  }
  if (isEnvoiSmsConfigured(env)) return 'envoisms';
  if (isTwilioConfigured(env)) return 'twilio';
  return 'none';
}

export function isEnvoiSmsConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.ENVOISMS_API_KEY?.trim());
}

export function isTwilioConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(
    env.TWILIO_ACCOUNT_SID?.trim() &&
    env.TWILIO_AUTH_TOKEN?.trim() &&
    env.TWILIO_PHONE_NUMBER?.trim(),
  );
}

export function getEnvoiSmsBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (env.ENVOISMS_BASE_URL || 'https://api.envoisms.ma').replace(
    /\/$/,
    '',
  );
}

export function getEnvoiSmsFrom(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const from = env.ENVOISMS_FROM?.trim();
  return from || undefined;
}

/**
 * Production must have a real SMS provider.
 * Prefer EnvoiSMS (Morocco); Twilio remains an allowed fallback.
 */
export function assertProductionSmsConfigured(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== 'production') return;
  if (
    env.NEXA_ENV === 'dogfood' &&
    /^\d{6}$/.test((env.DEMO_OTP_CODE ?? '').trim())
  ) {
    return;
  }
  const provider = resolveSmsProvider(env);
  if (provider === 'envoisms' && isEnvoiSmsConfigured(env)) return;
  if (provider === 'twilio' && isTwilioConfigured(env)) return;
  throw new Error(
    'SMS provider required in production. Set ENVOISMS_API_KEY (preferred) ' +
      'or TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_PHONE_NUMBER. Mock SMS is disabled.',
  );
}

export { isProductionRuntime };
