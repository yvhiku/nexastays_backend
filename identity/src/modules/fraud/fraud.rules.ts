export type FraudSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface FraudRuleResult {
  rule_name: string;
  risk_score: number;
  reason_code: string;
  severity: FraudSeverity;
  metadata?: Record<string, unknown>;
}

export interface FraudRuleContext {
  amount: number;
  sender_balance: number;
  recent_transfer_count: number;
  recent_transfer_window_minutes: number;
  recent_transfer_amount: number;
  rapid_drain_window_minutes: number;
  kyc_tier_limit: number | null;
  has_newly_trusted_device: boolean;
  recent_failed_pin_attempts: number;
  now: Date;
}

export interface FraudRulesConfig {
  velocity_max_transfers: number;
  velocity_window_minutes: number;
  rapid_drain_percent_threshold: number;
  rapid_drain_window_minutes: number;
  new_device_high_amount_threshold: number;
  suspicious_failed_pin_count: number;
  suspicious_high_value_amount: number;
}

type FraudRule = (
  context: FraudRuleContext,
  config: FraudRulesConfig,
) => FraudRuleResult | null;

const velocityRule: FraudRule = (context, config) => {
  const countWithCurrent = context.recent_transfer_count + 1;
  if (countWithCurrent <= config.velocity_max_transfers) {
    return null;
  }
  return {
    rule_name: 'VELOCITY',
    risk_score: 72,
    reason_code: 'VELOCITY_THRESHOLD_EXCEEDED',
    severity: 'HIGH',
    metadata: {
      transfer_count: countWithCurrent,
      window_minutes: config.velocity_window_minutes,
      threshold: config.velocity_max_transfers,
    },
  };
};

const rapidBalanceDrainRule: FraudRule = (context, config) => {
  if (context.sender_balance <= 0) return null;
  const totalSent = context.recent_transfer_amount + context.amount;
  const drainPercent = (totalSent / context.sender_balance) * 100;
  if (drainPercent <= config.rapid_drain_percent_threshold) {
    return null;
  }
  return {
    rule_name: 'RAPID_BALANCE_DRAIN',
    risk_score: 80,
    reason_code: 'RAPID_BALANCE_DRAIN_DETECTED',
    severity: 'HIGH',
    metadata: {
      drain_percent: Number(drainPercent.toFixed(2)),
      threshold_percent: config.rapid_drain_percent_threshold,
      window_minutes: config.rapid_drain_window_minutes,
    },
  };
};

const newDeviceHighAmountRule: FraudRule = (context, config) => {
  if (!context.has_newly_trusted_device) return null;
  if (context.amount < config.new_device_high_amount_threshold) return null;
  return {
    rule_name: 'NEW_DEVICE_HIGH_AMOUNT',
    risk_score: 60,
    reason_code: 'NEW_DEVICE_HIGH_AMOUNT',
    severity: 'MEDIUM',
    metadata: {
      amount: context.amount,
      threshold: config.new_device_high_amount_threshold,
      trusted_within_hours: 24,
    },
  };
};

const tierViolationRule: FraudRule = (context) => {
  if (context.kyc_tier_limit == null) return null;
  if (context.amount <= context.kyc_tier_limit) return null;
  return {
    rule_name: 'TIER_VIOLATION',
    risk_score: 88,
    reason_code: 'KYC_TIER_LIMIT_EXCEEDED',
    severity: 'HIGH',
    metadata: {
      amount: context.amount,
      tier_limit: context.kyc_tier_limit,
    },
  };
};

const suspiciousPatternRule: FraudRule = (context, config) => {
  if (context.amount < config.suspicious_high_value_amount) return null;
  if (context.recent_failed_pin_attempts < config.suspicious_failed_pin_count) {
    return null;
  }
  return {
    rule_name: 'SUSPICIOUS_PATTERN',
    risk_score: 67,
    reason_code: 'FAILED_PIN_THEN_HIGH_VALUE',
    severity: 'MEDIUM',
    metadata: {
      failed_pin_attempts: context.recent_failed_pin_attempts,
      failed_pin_threshold: config.suspicious_failed_pin_count,
      amount: context.amount,
      high_value_threshold: config.suspicious_high_value_amount,
    },
  };
};

const FRAUD_RULES: FraudRule[] = [
  velocityRule,
  rapidBalanceDrainRule,
  newDeviceHighAmountRule,
  tierViolationRule,
  suspiciousPatternRule,
];

export function evaluateFraudRules(
  context: FraudRuleContext,
  config: FraudRulesConfig,
): FraudRuleResult[] {
  const matches: FraudRuleResult[] = [];
  for (const rule of FRAUD_RULES) {
    const result = rule(context, config);
    if (result) matches.push(result);
  }
  return matches;
}
