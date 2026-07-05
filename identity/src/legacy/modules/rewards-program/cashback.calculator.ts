export interface CashbackInput {
  purchaseAmount: number;
  categoryId: number | null;
  userSelectedCategoryIds: number[];
  billingPeriodCategoryRates: Map<number, number>;
  currentPeriodTotalEarned: number;
  userTier: 'standard' | 'pro' | 'premium';
}

export interface CashbackResult {
  cashbackEarned: number;
  cashbackRate: number;
  cashbackType: 'universal' | 'category' | 'none';
  capReached: boolean;
  capLimit: number;
}

const TIER_CAPS: Record<CashbackInput['userTier'], number> = {
  standard: 300,
  pro: 500,
  premium: 3000,
};
const UNIVERSAL_RATE = 1.0;
const MIN_PURCHASE = 10.0;

export function calculateCashback(input: CashbackInput): CashbackResult {
  const capLimit = TIER_CAPS[input.userTier];

  if (input.purchaseAmount < MIN_PURCHASE) {
    return {
      cashbackEarned: 0,
      cashbackRate: 0,
      cashbackType: 'none',
      capReached: false,
      capLimit,
    };
  }

  const remainingCap = capLimit - input.currentPeriodTotalEarned;
  if (remainingCap <= 0) {
    return {
      cashbackEarned: 0,
      cashbackRate: 0,
      cashbackType: 'none',
      capReached: true,
      capLimit,
    };
  }

  let applicableRate = UNIVERSAL_RATE;
  let cashbackType: 'universal' | 'category' = 'universal';

  if (
    input.categoryId !== null &&
    input.userSelectedCategoryIds.includes(input.categoryId) &&
    input.billingPeriodCategoryRates.has(input.categoryId)
  ) {
    applicableRate = input.billingPeriodCategoryRates.get(
      input.categoryId,
    )!;
    cashbackType = 'category';
  }

  const rawCashback = input.purchaseAmount * (applicableRate / 100);
  const cashbackEarned = Math.min(rawCashback, remainingCap);

  return {
    cashbackEarned: Math.round(cashbackEarned * 100) / 100,
    cashbackRate: applicableRate,
    cashbackType,
    capReached: cashbackEarned >= remainingCap,
    capLimit,
  };
}
