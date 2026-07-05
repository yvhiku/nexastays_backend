import type {
  PolicyEvaluationInput,
  PolicyEvaluationResult,
  PolicyDenial,
} from './kyc-policy.types';

function num(v: string | number): number {
  return typeof v === 'number' ? v : Number(v);
}

function deny(code: string, message: string): PolicyEvaluationResult {
  return { ok: false, denial: { code, message } };
}

/** Pure policy evaluation — no I/O. Call after limits are merged and usage aggregated. */
export function evaluateKycMoneyMovementPolicy(
  input: PolicyEvaluationInput,
): PolicyEvaluationResult {
  const override = input.adminOverride;
  if (override?.bypass_all_limits) {
    return { ok: true };
  }

  const verified = input.normalizedKycStatus === 'VERIFIED';
  if (!override?.bypass_kyc_status_gate) {
    if (input.normalizedKycStatus === 'REJECTED') {
      return deny('KYC_REJECTED', 'KYC rejected — money movement is not allowed.');
    }
    if (!verified) {
      return deny(
        'KYC_NOT_VERIFIED',
        'Identity verification is required before this operation.',
      );
    }
  }

  if (input.amountMad <= 0) {
    return deny('INVALID_AMOUNT', 'Amount must be greater than zero.');
  }

  const L = input.tierLimits;
  const boostSingle = override?.boost_max_single_transfer_mad ?? 0;
  const boostDaily = override?.boost_daily_outflow_mad ?? 0;
  const boostMonthly = override?.boost_monthly_outflow_mad ?? 0;

  const maxSingle = L.maxSingleTransferMad + boostSingle;
  const dailyCap = L.dailyOutflowMad + boostDaily;
  const monthlyCap = L.monthlyOutflowMad + boostMonthly;

  // Sender jurisdiction — enforcement is backend-only (never trust device profile).
  const country = (input.senderCountryCode ?? '').trim().toUpperCase() || null;
  if (!country) {
    return deny(
      'KYC_SENDER_COUNTRY_UNKNOWN',
      'Residency or document country must be present for compliance checks.',
    );
  }

  const allowed = new Set(
    [...L.allowedCountryCodes, ...(override?.extra_allowed_country_codes ?? [])].map(
      (c) => c.trim().toUpperCase(),
    ),
  );
  const blocked = new Set(L.blockedCountryCodes.map((c) => c.trim().toUpperCase()));
  if (blocked.has(country)) {
    return deny('KYC_COUNTRY_BLOCKED', 'Money movement is not allowed from this country.');
  }
  if (allowed.size > 0 && !allowed.has(country)) {
    return deny('KYC_COUNTRY_NOT_ALLOWED', 'Money movement is not allowed for this country tier.');
  }

  // Platform subscription fee — verified users may pay even when P2P/withdraw caps are exhausted.
  if (input.operation === 'SUBSCRIPTION_PRO') {
    return { ok: true };
  }

  const { rolling } = input;

  // Wallet balance ceiling (top-up projection)
  if (input.operation === 'TOPUP' && L.maxWalletBalanceMad != null) {
    const projected = input.ledgerBalanceMad + input.amountMad;
    if (projected > L.maxWalletBalanceMad) {
      return deny(
        'KYC_WALLET_CAP_EXCEEDED',
        'Top-up would exceed the maximum wallet balance for your verification tier.',
      );
    }
  }

  const outboundOps = new Set<typeof input.operation>([
    'P2P_TRANSFER',
    'QR_PAYMENT',
    'NFC_PAYMENT',
    'WITHDRAW',
  ]);
  if (!outboundOps.has(input.operation)) {
    return { ok: true };
  }

  if (input.amountMad > maxSingle) {
    return deny(
      'KYC_SINGLE_TRANSFER_CAP',
      'Amount exceeds the maximum single transfer for your verification tier.',
    );
  }

  if (rolling.dailyOutflowDebitMad + input.amountMad > dailyCap) {
    return deny(
      'KYC_DAILY_OUTFLOW_CAP',
      'Daily outgoing limit for your tier has been reached.',
    );
  }
  if (rolling.monthlyOutflowDebitMad + input.amountMad > monthlyCap) {
    return deny(
      'KYC_MONTHLY_OUTFLOW_CAP',
      'Monthly outgoing limit for your tier has been reached.',
    );
  }

  if (input.operation === 'WITHDRAW') {
    const dw =
      num(L.dailyWithdrawalMad) + (override?.boost_daily_withdrawal_mad ?? 0);
    const mw =
      num(L.monthlyWithdrawalMad) +
      (override?.boost_monthly_withdrawal_mad ?? 0);
    if (rolling.dailyWithdrawalCompletedMad + input.amountMad > dw) {
      return deny(
        'KYC_DAILY_WITHDRAWAL_CAP',
        'Daily withdrawal limit for your tier has been reached.',
      );
    }
    if (rolling.monthlyWithdrawalCompletedMad + input.amountMad > mw) {
      return deny(
        'KYC_MONTHLY_WITHDRAWAL_CAP',
        'Monthly withdrawal limit for your tier has been reached.',
      );
    }
  }

  // Receiver routing rules (merchant / P2P)
  if (input.receiverUserId && L.blockedMerchantUserIds.includes(input.receiverUserId)) {
    return deny('KYC_MERCHANT_BLOCKED', 'Transfers to this counterparty are blocked by policy.');
  }
  if (L.allowedReceiverAccountTypes != null && L.allowedReceiverAccountTypes.length > 0) {
    const rt = (input.receiverAccountType ?? '').toUpperCase();
    const okType = L.allowedReceiverAccountTypes.some((x) => x.toUpperCase() === rt);
    if (!okType) {
      return deny(
        'KYC_RECEIVER_TYPE_NOT_ALLOWED',
        'Your tier does not allow this type of recipient.',
      );
    }
  }

  if (
    L.velocityMaxCompletedOutbound != null &&
    L.velocityWindowMinutes != null &&
    L.velocityWindowMinutes > 0
  ) {
    if (
      rolling.completedOutboundCountInWindow >= L.velocityMaxCompletedOutbound
    ) {
      return deny(
        'KYC_VELOCITY_LIMIT',
        'Too many outgoing payments in a short period — try again later.',
      );
    }
  }

  return { ok: true };
}

export function mergeDenialForAudit(denial: PolicyDenial): Record<string, string> {
  return { code: denial.code, message: denial.message };
}
