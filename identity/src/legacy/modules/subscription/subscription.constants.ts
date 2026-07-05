export type ProBillingPeriod = 'monthly' | 'yearly';

export const PRO_SUBSCRIPTION_PRICING_MAD: Record<ProBillingPeriod, number> = {
  monthly: 29,
  yearly: 290,
};

export function normalizeProBillingPeriod(
  raw: string | undefined,
): ProBillingPeriod | null {
  if (raw === 'monthly' || raw === 'yearly') {
    return raw;
  }
  return null;
}

export function getProSubscriptionPriceMad(period: ProBillingPeriod): number {
  return PRO_SUBSCRIPTION_PRICING_MAD[period];
}
