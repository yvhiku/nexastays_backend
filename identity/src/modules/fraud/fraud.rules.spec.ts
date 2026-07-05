import {
  evaluateFraudRules,
  type FraudRuleContext,
  type FraudRulesConfig,
} from './fraud.rules';

describe('Fraud Rules', () => {
  const config: FraudRulesConfig = {
    velocity_max_transfers: 3,
    velocity_window_minutes: 5,
    rapid_drain_percent_threshold: 70,
    rapid_drain_window_minutes: 10,
    new_device_high_amount_threshold: 1500,
    suspicious_failed_pin_count: 3,
    suspicious_high_value_amount: 1200,
  };

  const baseContext: FraudRuleContext = {
    amount: 100,
    sender_balance: 2000,
    recent_transfer_count: 0,
    recent_transfer_window_minutes: 5,
    recent_transfer_amount: 0,
    rapid_drain_window_minutes: 10,
    kyc_tier_limit: null,
    has_newly_trusted_device: false,
    recent_failed_pin_attempts: 0,
    now: new Date('2026-01-01T10:00:00.000Z'),
  };

  it('triggers velocity rule when transfers exceed threshold', () => {
    const events = evaluateFraudRules(
      { ...baseContext, recent_transfer_count: 3 },
      config,
    );
    expect(
      events.some(
        (event) => event.reason_code === 'VELOCITY_THRESHOLD_EXCEEDED',
      ),
    ).toBe(true);
  });

  it('triggers rapid balance drain rule when drain percent exceeded', () => {
    const events = evaluateFraudRules(
      {
        ...baseContext,
        amount: 600,
        sender_balance: 1000,
        recent_transfer_amount: 200,
      },
      config,
    );
    expect(
      events.some(
        (event) => event.reason_code === 'RAPID_BALANCE_DRAIN_DETECTED',
      ),
    ).toBe(true);
  });

  it('triggers new device high amount rule', () => {
    const events = evaluateFraudRules(
      {
        ...baseContext,
        has_newly_trusted_device: true,
        amount: 2000,
      },
      config,
    );
    expect(
      events.some((event) => event.reason_code === 'NEW_DEVICE_HIGH_AMOUNT'),
    ).toBe(true);
  });

  it('triggers tier violation rule when amount exceeds tier limit', () => {
    const events = evaluateFraudRules(
      { ...baseContext, amount: 600, kyc_tier_limit: 500 },
      config,
    );
    expect(
      events.some((event) => event.reason_code === 'KYC_TIER_LIMIT_EXCEEDED'),
    ).toBe(true);
  });

  it('triggers suspicious pattern rule after failed PIN attempts', () => {
    const events = evaluateFraudRules(
      {
        ...baseContext,
        amount: 1500,
        recent_failed_pin_attempts: 3,
      },
      config,
    );
    expect(
      events.some(
        (event) => event.reason_code === 'FAILED_PIN_THEN_HIGH_VALUE',
      ),
    ).toBe(true);
  });
});
