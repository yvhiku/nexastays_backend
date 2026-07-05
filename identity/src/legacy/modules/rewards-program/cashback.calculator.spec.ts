import { calculateCashback } from './cashback.calculator';

describe('calculateCashback', () => {
  const base = {
    userSelectedCategoryIds: [1],
    billingPeriodCategoryRates: new Map([[1, 4.0]]),
    currentPeriodTotalEarned: 0,
    userTier: 'standard' as const,
  };

  it('returns 0 cashback for purchases below 10 MAD', () => {
    const r = calculateCashback({
      ...base,
      purchaseAmount: 9.99,
      categoryId: 1,
    });
    expect(r.cashbackEarned).toBe(0);
    expect(r.cashbackType).toBe('none');
  });

  it('applies 1% universal rate when category is not selected', () => {
    const r = calculateCashback({
      ...base,
      purchaseAmount: 100,
      categoryId: 2,
      userSelectedCategoryIds: [1],
    });
    expect(r.cashbackRate).toBe(1);
    expect(r.cashbackType).toBe('universal');
    expect(r.cashbackEarned).toBe(1);
  });

  it('applies category rate (2–5%) when category is in user selection', () => {
    const r = calculateCashback({
      ...base,
      purchaseAmount: 100,
      categoryId: 1,
    });
    expect(r.cashbackRate).toBe(4);
    expect(r.cashbackType).toBe('category');
    expect(r.cashbackEarned).toBe(4);
  });

  it('caps cashback at Standard tier limit of 300 MAD', () => {
    const r = calculateCashback({
      ...base,
      purchaseAmount: 50000,
      categoryId: 2,
      userSelectedCategoryIds: [],
      billingPeriodCategoryRates: new Map(),
      currentPeriodTotalEarned: 0,
      userTier: 'standard',
    });
    expect(r.cashbackEarned).toBe(300);
    expect(r.capReached).toBe(true);
  });

  it('caps cashback at Pro tier limit of 500 MAD', () => {
    const r = calculateCashback({
      ...base,
      purchaseAmount: 100000,
      categoryId: 2,
      userSelectedCategoryIds: [],
      billingPeriodCategoryRates: new Map(),
      currentPeriodTotalEarned: 0,
      userTier: 'pro',
    });
    expect(r.cashbackEarned).toBe(500);
  });

  it('caps cashback at Premium tier limit of 3000 MAD', () => {
    const r = calculateCashback({
      ...base,
      purchaseAmount: 500000,
      categoryId: 2,
      userSelectedCategoryIds: [],
      billingPeriodCategoryRates: new Map(),
      currentPeriodTotalEarned: 0,
      userTier: 'premium',
    });
    expect(r.cashbackEarned).toBe(3000);
  });

  it('returns capReached=true when remaining cap is 0', () => {
    const r = calculateCashback({
      ...base,
      purchaseAmount: 100,
      categoryId: 1,
      currentPeriodTotalEarned: 300,
      userTier: 'standard',
    });
    expect(r.cashbackEarned).toBe(0);
    expect(r.capReached).toBe(true);
  });

  it('applies partial cashback when purchase would exceed remaining cap', () => {
    const r = calculateCashback({
      ...base,
      purchaseAmount: 1000,
      categoryId: 2,
      userSelectedCategoryIds: [],
      billingPeriodCategoryRates: new Map(),
      currentPeriodTotalEarned: 298,
      userTier: 'standard',
    });
    expect(r.cashbackEarned).toBe(2);
    expect(r.capReached).toBe(true);
  });

  it('returns cashbackType=universal for uncategorized transactions', () => {
    const r = calculateCashback({
      ...base,
      purchaseAmount: 50,
      categoryId: null,
    });
    expect(r.cashbackType).toBe('universal');
  });

  it('returns cashbackType=category for transactions in selected categories', () => {
    const r = calculateCashback({
      ...base,
      purchaseAmount: 50,
      categoryId: 1,
    });
    expect(r.cashbackType).toBe('category');
  });
});
