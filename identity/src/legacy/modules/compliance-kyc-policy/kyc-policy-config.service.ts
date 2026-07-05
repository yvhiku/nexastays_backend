import { Injectable } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { GlobalKycPolicyDefaults, EffectiveTierLimits } from './kyc-policy.types';
import type { KycTierPolicy } from './entities/kyc-tier-policy.entity';

const BUNDLED_DEFAULTS: GlobalKycPolicyDefaults = {
  global: {
    default_allowed_sender_country_codes: ['MA'],
    default_blocked_sender_country_codes: [],
  },
};

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : Number(v);
}

@Injectable()
export class KycPolicyConfigService {
  private cached: GlobalKycPolicyDefaults | null = null;

  getGlobalDefaults(): GlobalKycPolicyDefaults {
    if (this.cached) return this.cached;
    const envPath = process.env.KYC_POLICY_RULES_PATH?.trim();
    if (envPath && existsSync(envPath)) {
      const raw = readFileSync(envPath, 'utf-8');
      this.cached = JSON.parse(raw) as GlobalKycPolicyDefaults;
      return this.cached;
    }
    try {
      const bundled = join(__dirname, 'config', 'kyc-tier-policy.defaults.json');
      if (existsSync(bundled)) {
        const raw = readFileSync(bundled, 'utf-8');
        this.cached = JSON.parse(raw) as GlobalKycPolicyDefaults;
        return this.cached;
      }
    } catch {
      /* use BUNDLED_DEFAULTS */
    }
    this.cached = BUNDLED_DEFAULTS;
    return this.cached;
  }

  /** Build effective limits: DB tier row + global country defaults */
  toEffectiveTierLimits(row: KycTierPolicy): EffectiveTierLimits {
    const g = this.getGlobalDefaults().global;
    const allowed =
      row.allowed_country_codes ??
      g.default_allowed_sender_country_codes.map((c) => c.toUpperCase());
    const blocked = [
      ...g.default_blocked_sender_country_codes.map((c) => c.toUpperCase()),
      ...(row.blocked_country_codes ?? []).map((c) => String(c).toUpperCase()),
    ];
    return {
      maxSingleTransferMad: num(row.max_single_transfer_mad),
      dailyOutflowMad: num(row.daily_outflow_mad),
      monthlyOutflowMad: num(row.monthly_outflow_mad),
      maxWalletBalanceMad:
        row.max_wallet_balance_mad == null
          ? null
          : num(row.max_wallet_balance_mad),
      dailyWithdrawalMad: num(row.daily_withdrawal_mad),
      monthlyWithdrawalMad: num(row.monthly_withdrawal_mad),
      allowedCountryCodes: allowed.map((c) => c.toUpperCase()),
      blockedCountryCodes: [...new Set(blocked)],
      allowedReceiverAccountTypes: row.allowed_receiver_account_types
        ? row.allowed_receiver_account_types.map((c) => c.toUpperCase())
        : null,
      blockedMerchantUserIds: [...(row.blocked_merchant_user_ids ?? [])],
      velocityMaxCompletedOutbound: row.velocity_max_completed_outbound,
      velocityWindowMinutes: row.velocity_window_minutes,
    };
  }
}
