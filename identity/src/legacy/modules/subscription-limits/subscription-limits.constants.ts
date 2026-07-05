export type SubscriptionTierKey = 'standard' | 'pro' | 'premium';

export interface SubscriptionTierLimits {
  maxWalletBalanceMad: number;
  dailyOutflowMad: number;
  monthlyOutflowMad: number;
  qrPaymentsDailyMad: number;
  maxSingleTransferMad: number;
  cashbackCapMad: number;
}

export const SUBSCRIPTION_TIER_LIMITS: Record<
  SubscriptionTierKey,
  SubscriptionTierLimits
> = {
  standard: {
    maxWalletBalanceMad: 10_000,
    dailyOutflowMad: 5_000,
    monthlyOutflowMad: 20_000,
    qrPaymentsDailyMad: 3_000,
    maxSingleTransferMad: 5_000,
    cashbackCapMad: 300,
  },
  pro: {
    maxWalletBalanceMad: 50_000,
    dailyOutflowMad: 20_000,
    monthlyOutflowMad: 100_000,
    qrPaymentsDailyMad: 15_000,
    maxSingleTransferMad: 20_000,
    cashbackCapMad: 500,
  },
  premium: {
    maxWalletBalanceMad: 50_000,
    dailyOutflowMad: 20_000,
    monthlyOutflowMad: 100_000,
    qrPaymentsDailyMad: 15_000,
    maxSingleTransferMad: 20_000,
    cashbackCapMad: 3000,
  },
};

export function normalizeSubscriptionTier(
  raw: string | null | undefined,
): SubscriptionTierKey {
  const t = (raw ?? 'standard').toLowerCase();
  if (t === 'pro' || t === 'premium') return t;
  return 'standard';
}

/** Pure merge for unit tests and SubscriptionLimitsService. */
export function mergeSubscriptionWithKycLimits(
  kycLimits: {
    maxSingleTransferMad: number;
    dailyOutflowMad: number;
    monthlyOutflowMad: number;
    maxWalletBalanceMad: number | null;
  },
  subscription: SubscriptionTierLimits,
): typeof kycLimits {
  const min = (a: number, b: number) => Math.min(a, b);
  const minNullable = (a: number | null, b: number) =>
    a == null ? b : Math.min(a, b);
  return {
    maxSingleTransferMad: min(
      kycLimits.maxSingleTransferMad,
      subscription.maxSingleTransferMad,
    ),
    dailyOutflowMad: min(kycLimits.dailyOutflowMad, subscription.dailyOutflowMad),
    monthlyOutflowMad: min(
      kycLimits.monthlyOutflowMad,
      subscription.monthlyOutflowMad,
    ),
    maxWalletBalanceMad: minNullable(
      kycLimits.maxWalletBalanceMad,
      subscription.maxWalletBalanceMad,
    ),
  };
}
