export const RP_TX_TYPES_ELIGIBLE_FOR_CASHBACK = new Set([
  'QR_PAYMENT',
  'MERCHANT_PAYMENT',
]);

export const TIER_CAPS_MAD: Record<'standard' | 'pro' | 'premium', number> = {
  standard: 300,
  pro: 500,
  premium: 3000,
};

export function normalizeRewardsTier(
  raw: string | null | undefined,
): 'standard' | 'pro' | 'premium' {
  const t = (raw || 'standard').toLowerCase();
  if (t === 'pro' || t === 'premium') return t;
  return 'standard';
}

export function tierRank(t: 'standard' | 'pro' | 'premium'): number {
  return t === 'standard' ? 0 : t === 'pro' ? 1 : 2;
}
