import {
  SUBSCRIPTION_TIER_LIMITS,
  mergeSubscriptionWithKycLimits,
} from './subscription-limits.constants';

describe('mergeSubscriptionWithKycLimits', () => {
  it('takes minimum per axis when KYC caps are higher than Pro subscription', () => {
    const kyc = {
      maxSingleTransferMad: 50_000,
      dailyOutflowMad: 50_000,
      monthlyOutflowMad: 500_000,
      maxWalletBalanceMad: 500_000,
    };
    const sub = SUBSCRIPTION_TIER_LIMITS.pro;
    const merged = mergeSubscriptionWithKycLimits(kyc, sub);
    expect(merged.dailyOutflowMad).toBe(sub.dailyOutflowMad);
    expect(merged.monthlyOutflowMad).toBe(sub.monthlyOutflowMad);
    expect(merged.maxSingleTransferMad).toBe(sub.maxSingleTransferMad);
    expect(merged.maxWalletBalanceMad).toBe(sub.maxWalletBalanceMad);
  });

  it('standard policy caps match product table', () => {
    expect(SUBSCRIPTION_TIER_LIMITS.standard.dailyOutflowMad).toBe(5_000);
    expect(SUBSCRIPTION_TIER_LIMITS.pro.qrPaymentsDailyMad).toBe(15_000);
  });
});
