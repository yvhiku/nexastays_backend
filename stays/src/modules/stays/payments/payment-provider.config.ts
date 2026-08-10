/** Active stays payment provider (`mock` | `cmi`). */
export function getStaysPaymentProvider(): string {
  return (process.env.STAYS_PAYMENT_PROVIDER ?? 'mock').trim().toLowerCase();
}

export function isMockPaymentProvider(): boolean {
  return getStaysPaymentProvider() === 'mock';
}

/**
 * Legacy unauthenticated mock webhook — local dev / automated tests only.
 * Never enabled in production regardless of payment provider.
 */
export function isLegacyMockWebhookEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  if (!isMockPaymentProvider()) {
    return false;
  }
  return process.env.ALLOW_LEGACY_MOCK_WEBHOOK === 'true';
}
