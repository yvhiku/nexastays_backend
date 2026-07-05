import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycTierPolicy } from './entities/kyc-tier-policy.entity';
import { KYC_TIER_POLICY_SEED_ROWS } from './kyc-tier-policy.seed';

/**
 * Ensures baseline kyc_tier_policies rows exist (dev DBs may skip SQL migration 046).
 */
@Injectable()
export class KycTierPolicySeedService implements OnModuleInit {
  private readonly logger = new Logger(KycTierPolicySeedService.name);

  constructor(
    @InjectRepository(KycTierPolicy)
    private readonly tierRepo: Repository<KycTierPolicy>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.KYC_TIER_POLICY_AUTO_SEED === 'false') {
      return;
    }
    try {
      await this.ensureBaselineTiers();
    } catch (err) {
      this.logger.error(
        'Failed to seed kyc_tier_policies — money movements may return KYC_POLICY_MISCONFIGURED',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async ensureBaselineTiers(): Promise<void> {
    for (const row of KYC_TIER_POLICY_SEED_ROWS) {
      const existing = await this.tierRepo.findOne({
        where: { tier_key: row.tier_key },
      });
      if (existing) {
        continue;
      }
      await this.tierRepo.save({
        tier_key: row.tier_key,
        max_single_transfer_mad: row.max_single_transfer_mad,
        daily_outflow_mad: row.daily_outflow_mad,
        monthly_outflow_mad: row.monthly_outflow_mad,
        max_wallet_balance_mad: row.max_wallet_balance_mad,
        daily_withdrawal_mad: row.daily_withdrawal_mad,
        monthly_withdrawal_mad: row.monthly_withdrawal_mad,
        allowed_country_codes: row.allowed_country_codes,
        blocked_country_codes: row.blocked_country_codes,
        allowed_receiver_account_types: row.allowed_receiver_account_types,
        blocked_merchant_user_ids: row.blocked_merchant_user_ids,
        velocity_max_completed_outbound: row.velocity_max_completed_outbound,
        velocity_window_minutes: row.velocity_window_minutes,
      });
      this.logger.log(`Seeded kyc_tier_policies tier_key=${row.tier_key}`);
    }
  }
}
