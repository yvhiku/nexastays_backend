/** Baseline KYC tier limits — keep in sync with database/migrations/046_kyc_tier_policies_seed.sql */
export type KycTierPolicySeedRow = {
  tier_key: string;
  max_single_transfer_mad: number;
  daily_outflow_mad: number;
  monthly_outflow_mad: number;
  max_wallet_balance_mad: number | null;
  daily_withdrawal_mad: number;
  monthly_withdrawal_mad: number;
  allowed_country_codes: string[] | null;
  blocked_country_codes: string[];
  allowed_receiver_account_types: string[] | null;
  blocked_merchant_user_ids: string[];
  velocity_max_completed_outbound: number | null;
  velocity_window_minutes: number | null;
};

export const KYC_TIER_POLICY_SEED_ROWS: KycTierPolicySeedRow[] = [
  {
    tier_key: 'NONE',
    max_single_transfer_mad: 0,
    daily_outflow_mad: 0,
    monthly_outflow_mad: 0,
    max_wallet_balance_mad: 500,
    daily_withdrawal_mad: 0,
    monthly_withdrawal_mad: 0,
    allowed_country_codes: ['MA'],
    blocked_country_codes: [],
    allowed_receiver_account_types: ['CONSUMER'],
    blocked_merchant_user_ids: [],
    velocity_max_completed_outbound: 3,
    velocity_window_minutes: 60,
  },
  {
    tier_key: 'BASIC',
    max_single_transfer_mad: 2000,
    daily_outflow_mad: 5000,
    monthly_outflow_mad: 25000,
    max_wallet_balance_mad: 20000,
    daily_withdrawal_mad: 5000,
    monthly_withdrawal_mad: 20000,
    allowed_country_codes: ['MA'],
    blocked_country_codes: [],
    allowed_receiver_account_types: ['CONSUMER', 'MERCHANT'],
    blocked_merchant_user_ids: [],
    velocity_max_completed_outbound: 5,
    velocity_window_minutes: 60,
  },
  {
    tier_key: 'STANDARD',
    max_single_transfer_mad: 5000,
    daily_outflow_mad: 10000,
    monthly_outflow_mad: 100000,
    max_wallet_balance_mad: 100000,
    daily_withdrawal_mad: 10000,
    monthly_withdrawal_mad: 80000,
    allowed_country_codes: ['MA'],
    blocked_country_codes: [],
    allowed_receiver_account_types: null,
    blocked_merchant_user_ids: [],
    velocity_max_completed_outbound: 10,
    velocity_window_minutes: 60,
  },
  {
    tier_key: 'FULL',
    max_single_transfer_mad: 50000,
    daily_outflow_mad: 50000,
    monthly_outflow_mad: 500000,
    max_wallet_balance_mad: 500000,
    daily_withdrawal_mad: 50000,
    monthly_withdrawal_mad: 400000,
    allowed_country_codes: ['MA', 'FR', 'ES'],
    blocked_country_codes: [],
    allowed_receiver_account_types: null,
    blocked_merchant_user_ids: [],
    velocity_max_completed_outbound: 20,
    velocity_window_minutes: 60,
  },
];
