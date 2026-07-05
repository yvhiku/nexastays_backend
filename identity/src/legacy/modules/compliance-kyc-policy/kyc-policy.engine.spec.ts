import { evaluateKycMoneyMovementPolicy } from './kyc-policy.engine';
import type { PolicyEvaluationInput, EffectiveTierLimits } from './kyc-policy.types';
import {
  isKycVerifiedForMoneyMovement,
  normalizeKycStatus,
} from './kyc-status';

const baseTier: EffectiveTierLimits = {
  maxSingleTransferMad: 5000,
  dailyOutflowMad: 10000,
  monthlyOutflowMad: 100000,
  maxWalletBalanceMad: 50000,
  dailyWithdrawalMad: 5000,
  monthlyWithdrawalMad: 40000,
  allowedCountryCodes: ['MA'],
  blockedCountryCodes: [],
  allowedReceiverAccountTypes: null,
  blockedMerchantUserIds: [],
  velocityMaxCompletedOutbound: 10,
  velocityWindowMinutes: 60,
};

const baseInput = (): PolicyEvaluationInput => ({
  normalizedKycStatus: 'VERIFIED',
  tierKey: 'STANDARD',
  operation: 'P2P_TRANSFER',
  amountMad: 100,
  ledgerBalanceMad: 1000,
  senderCountryCode: 'MA',
  receiverAccountType: 'CONSUMER',
  receiverUserId: '00000000-0000-4000-8000-000000000001',
  rolling: {
    dailyOutflowDebitMad: 0,
    monthlyOutflowDebitMad: 0,
    dailyWithdrawalCompletedMad: 0,
    monthlyWithdrawalCompletedMad: 0,
    completedOutboundCountInWindow: 0,
  },
  tierLimits: baseTier,
  adminOverride: null,
});

describe('evaluateKycMoneyMovementPolicy', () => {
  it('allows verified user within caps', () => {
    const r = evaluateKycMoneyMovementPolicy(baseInput());
    expect(r.ok).toBe(true);
  });

  it('denies when KYC not verified', () => {
    const r = evaluateKycMoneyMovementPolicy({
      ...baseInput(),
      normalizedKycStatus: 'PENDING',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.denial.code).toBe('KYC_NOT_VERIFIED');
  });

  it('allows bypass_all_limits without verification', () => {
    const r = evaluateKycMoneyMovementPolicy({
      ...baseInput(),
      normalizedKycStatus: 'PENDING',
      adminOverride: {
        bypass_kyc_status_gate: false,
        bypass_all_limits: true,
        boost_daily_outflow_mad: 0,
        boost_monthly_outflow_mad: 0,
        boost_max_single_transfer_mad: 0,
        boost_daily_withdrawal_mad: 0,
        boost_monthly_withdrawal_mad: 0,
        extra_allowed_country_codes: [],
      },
    });
    expect(r.ok).toBe(true);
  });

  it('denies unknown sender country', () => {
    const r = evaluateKycMoneyMovementPolicy({
      ...baseInput(),
      senderCountryCode: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.denial.code).toBe('KYC_SENDER_COUNTRY_UNKNOWN');
  });

  it('denies when single-transfer cap exceeded', () => {
    const r = evaluateKycMoneyMovementPolicy({
      ...baseInput(),
      amountMad: 6000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.denial.code).toBe('KYC_SINGLE_TRANSFER_CAP');
  });

  it('denies top-up over wallet cap', () => {
    const r = evaluateKycMoneyMovementPolicy({
      ...baseInput(),
      operation: 'TOPUP',
      amountMad: 49001,
      ledgerBalanceMad: 1000,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.denial.code).toBe('KYC_WALLET_CAP_EXCEEDED');
  });

  it('enforces blocked merchant list', () => {
    const badId = '00000000-0000-4000-8000-000000000099';
    const r = evaluateKycMoneyMovementPolicy({
      ...baseInput(),
      receiverUserId: badId,
      tierLimits: {
        ...baseTier,
        blockedMerchantUserIds: [badId],
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.denial.code).toBe('KYC_MERCHANT_BLOCKED');
  });

  it('enforces velocity on completed outbound count', () => {
    const r = evaluateKycMoneyMovementPolicy({
      ...baseInput(),
      rolling: {
        ...baseInput().rolling,
        completedOutboundCountInWindow: 10,
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.denial.code).toBe('KYC_VELOCITY_LIMIT');
  });

  it('allows SUBSCRIPTION_PRO when single-transfer cap would block WITHDRAW', () => {
    const r = evaluateKycMoneyMovementPolicy({
      ...baseInput(),
      operation: 'SUBSCRIPTION_PRO',
      amountMad: 290,
      tierLimits: {
        ...baseTier,
        maxSingleTransferMad: 0,
        dailyOutflowMad: 0,
        monthlyOutflowMad: 0,
      },
    });
    expect(r.ok).toBe(true);
  });

  it('still denies SUBSCRIPTION_PRO when KYC not verified', () => {
    const r = evaluateKycMoneyMovementPolicy({
      ...baseInput(),
      operation: 'SUBSCRIPTION_PRO',
      normalizedKycStatus: 'PENDING',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.denial.code).toBe('KYC_NOT_VERIFIED');
  });
});

describe('kyc-status helpers', () => {
  it('normalizes APPROVED to VERIFIED', () => {
    expect(normalizeKycStatus('APPROVED')).toBe('VERIFIED');
  });

  it('treats APPROVED as verified for money movement', () => {
    expect(isKycVerifiedForMoneyMovement('APPROVED')).toBe(true);
  });
});
