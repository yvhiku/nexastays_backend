export type MoneyMovementOperation =
  | 'P2P_TRANSFER'
  | 'QR_PAYMENT'
  | 'NFC_PAYMENT'
  | 'WITHDRAW'
  | 'TOPUP'
  /** In-app Nexa Pro fee — not subject to P2P/QR/withdraw outflow caps */
  | 'SUBSCRIPTION_PRO';

export interface GlobalKycPolicyDefaults {
  global: {
    default_allowed_sender_country_codes: string[];
    default_blocked_sender_country_codes: string[];
  };
}

export interface EffectiveTierLimits {
  maxSingleTransferMad: number;
  dailyOutflowMad: number;
  monthlyOutflowMad: number;
  maxWalletBalanceMad: number | null;
  dailyWithdrawalMad: number;
  monthlyWithdrawalMad: number;
  allowedCountryCodes: string[];
  blockedCountryCodes: string[];
  allowedReceiverAccountTypes: string[] | null;
  blockedMerchantUserIds: string[];
  velocityMaxCompletedOutbound: number | null;
  velocityWindowMinutes: number | null;
}

export interface RollingUsageSnapshot {
  dailyOutflowDebitMad: number;
  monthlyOutflowDebitMad: number;
  dailyWithdrawalCompletedMad: number;
  monthlyWithdrawalCompletedMad: number;
  completedOutboundCountInWindow: number;
}

export interface AdminOverrideEffective {
  bypass_kyc_status_gate: boolean;
  bypass_all_limits: boolean;
  boost_daily_outflow_mad: number;
  boost_monthly_outflow_mad: number;
  boost_max_single_transfer_mad: number;
  /** Separate from outflow boosts — applies only to withdrawal caps in the engine. */
  boost_daily_withdrawal_mad: number;
  boost_monthly_withdrawal_mad: number;
  extra_allowed_country_codes: string[];
}

export interface PolicyEvaluationInput {
  normalizedKycStatus: string;
  tierKey: string;
  operation: MoneyMovementOperation;
  amountMad: number;
  ledgerBalanceMad: number;
  /** Resolved ISO-3166 alpha-2 sender country (profile / document) */
  senderCountryCode: string | null;
  receiverAccountType: string | null;
  receiverUserId: string | null;
  rolling: RollingUsageSnapshot;
  tierLimits: EffectiveTierLimits;
  adminOverride: AdminOverrideEffective | null;
}

export interface PolicyDenial {
  code: string;
  message: string;
}

export type PolicyEvaluationResult =
  | { ok: true }
  | { ok: false; denial: PolicyDenial };
