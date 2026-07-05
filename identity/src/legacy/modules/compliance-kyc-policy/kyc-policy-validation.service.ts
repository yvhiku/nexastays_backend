import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import type { Request } from 'express';
import { User } from '../../users/entities/user.entity';
import { KycProfile } from '../entities/kyc-profile.entity';
import { KycTierPolicy } from './entities/kyc-tier-policy.entity';
import { KycAdminOverride } from './entities/kyc-admin-override.entity';
import { TransactionLimit } from '../entities/transaction-limit.entity';
import { LedgerEntry } from '../../ledger/entities/ledger-entry.entity';
import { AppTransaction } from '../../transactions/entities/app-transaction.entity';
import { AuditService } from '../../audit/audit.service';
import { KycPolicyConfigService } from './kyc-policy-config.service';
import {
  evaluateKycMoneyMovementPolicy,
  mergeDenialForAudit,
} from './kyc-policy.engine';
import type {
  AdminOverrideEffective,
  MoneyMovementOperation,
  RollingUsageSnapshot,
} from './kyc-policy.types';
import { normalizeKycStatus } from './kyc-status';
import { isBypassAllLimitsEffective } from './kyc-policy.override-effectiveness';
import { SubscriptionLimitsService } from '../../subscription-limits/subscription-limits.service';
import { normalizeSubscriptionTier } from '../../subscription-limits/subscription-limits.constants';

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : Number(v);
}

export function appTransactionTypeToOperation(
  appType: string,
): MoneyMovementOperation {
  switch (appType) {
    case 'TRANSFER':
      return 'P2P_TRANSFER';
    case 'QR_PAYMENT':
      return 'QR_PAYMENT';
    case 'NFC_PAYMENT':
      return 'NFC_PAYMENT';
    default:
      return 'P2P_TRANSFER';
  }
}

@Injectable()
export class KycPolicyValidationService {
  constructor(
    @InjectRepository(TransactionLimit)
    private readonly legacyLimitRepo: Repository<TransactionLimit>,
    @InjectRepository(KycTierPolicy)
    private readonly tierRepo: Repository<KycTierPolicy>,
    @InjectRepository(KycAdminOverride)
    private readonly overrideRepo: Repository<KycAdminOverride>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly configService: KycPolicyConfigService,
    private readonly auditService: AuditService,
    @Optional()
    private readonly subscriptionLimits?: SubscriptionLimitsService,
  ) {}

  /** Fraud / pre-checks: per-attempt max for tier (no user loaded). */
  async getMaxSingleTransferMadForTier(
    tierKey: string | null | undefined,
  ): Promise<number | null> {
    const key = (tierKey ?? 'NONE').trim().toUpperCase() || 'NONE';
    const row = await this.tierRepo.findOne({ where: { tier_key: key } });
    if (row) return num(row.max_single_transfer_mad);
    const legacy = await this.legacyLimitRepo.findOne({
      where: { kyc_level: key },
    });
    if (legacy?.daily_limit != null) return num(legacy.daily_limit);
    return null;
  }

  /**
   * Fast HTTP-layer gate (runs in guard/middleware): verified KYC or break-glass override only.
   */
  async assertCoarseVerifiedGate(
    userId: string,
    req?: Request | null,
  ): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const override = await this.loadMergedOverrides(userId);
    if (override?.bypass_kyc_status_gate || override?.bypass_all_limits) {
      return;
    }
    const normalized = normalizeKycStatus(user.kyc_status);
    if (normalized !== 'VERIFIED') {
      await this.auditService
        .audit({
          actorUserId: userId,
          action: 'KYC_COARSE_GATE_DENIED',
          targetType: 'USER',
          targetId: userId,
          metadata: { normalized_kyc_status: normalized },
          req: req ?? null,
        })
        .catch(() => {});
      throw new ForbiddenException({
        code: 'KYC_NOT_VERIFIED',
        message:
          'Identity verification is required before moving money from this account.',
      });
    }
  }

  async assertMoneyMovementAllowed(params: {
    manager: EntityManager;
    actorUserId: string;
    operation: MoneyMovementOperation;
    amountMad: number;
    ledgerAccountId: string;
    ledgerBalanceMad: number;
    receiver?: { id: string; account_type: string } | null;
    req?: Request | null;
    auditContext?: Record<string, unknown>;
  }): Promise<void> {
    const {
      manager,
      actorUserId,
      amountMad,
      ledgerAccountId,
      ledgerBalanceMad,
      receiver,
    } = params;

    // Subscription fees must never use P2P/withdraw caps (even if caller passes WITHDRAW).
    let operation: MoneyMovementOperation = params.operation;
    if (params.auditContext?.app_transaction_type === 'SUBSCRIPTION_PRO') {
      operation = 'SUBSCRIPTION_PRO';
    }

    const user = await manager.getRepository(User).findOne({
      where: { id: actorUserId },
    });
    if (!user) throw new NotFoundException('User not found');

    const kyc = await manager.getRepository(KycProfile).findOne({
      where: { user_id: actorUserId },
    });
    const tierKey = (kyc?.level ?? 'NONE').trim().toUpperCase() || 'NONE';
    const tierRow =
      (await manager.getRepository(KycTierPolicy).findOne({
        where: { tier_key: tierKey },
      })) ??
      (await manager.getRepository(KycTierPolicy).findOne({
        where: { tier_key: 'NONE' },
      }));
    if (!tierRow) {
      throw new ForbiddenException({
        error: 'KYC_POLICY_MISCONFIGURED',
        message: 'Verification tier limits are not configured.',
      });
    }

    let tierLimits = this.configService.toEffectiveTierLimits(tierRow);
    const normalizedStatus = normalizeKycStatus(user.kyc_status);
    if (normalizedStatus === 'VERIFIED' && this.subscriptionLimits) {
      const subTier = normalizeSubscriptionTier(user.rewards_tier);
      const subPolicy = this.subscriptionLimits.getPolicy(subTier);
      tierLimits = this.subscriptionLimits.mergeWithKycLimits(
        tierLimits,
        subPolicy,
      );
    }
    const override = await this.loadMergedOverridesWithManager(
      manager,
      actorUserId,
    );

    const senderCountry =
      (kyc?.document_country ?? user.nationality ?? '').trim().toUpperCase() ||
      null;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const dailyRow = await manager
      .getRepository(LedgerEntry)
      .createQueryBuilder('le')
      .select(
        "COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0)",
        'amount',
      )
      .where('le.account_id = :accountId', { accountId: ledgerAccountId })
      .andWhere('le.created_at >= :start', { start: startOfDay })
      .getRawOne();
    const monthlyRow = await manager
      .getRepository(LedgerEntry)
      .createQueryBuilder('le')
      .select(
        "COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0)",
        'amount',
      )
      .where('le.account_id = :accountId', { accountId: ledgerAccountId })
      .andWhere('le.created_at >= :start', { start: startOfMonth })
      .getRawOne();

    const dailyWithdrawRow = await manager
      .getRepository(AppTransaction)
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount), 0)', 'total')
      .where('t.sender_user_id = :uid', { uid: actorUserId })
      .andWhere('t.type = :typ', { typ: 'WITHDRAW' })
      .andWhere('t.status = :st', { st: 'COMPLETED' })
      .andWhere('t.created_at >= :start', { start: startOfDay })
      .getRawOne();
    const monthlyWithdrawRow = await manager
      .getRepository(AppTransaction)
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.amount), 0)', 'total')
      .where('t.sender_user_id = :uid', { uid: actorUserId })
      .andWhere('t.type = :typ', { typ: 'WITHDRAW' })
      .andWhere('t.status = :st', { st: 'COMPLETED' })
      .andWhere('t.created_at >= :start', { start: startOfMonth })
      .getRawOne();

    const velWindowMin = tierLimits.velocityWindowMinutes ?? 60;
    const velocityStart = new Date(now.getTime() - velWindowMin * 60 * 1000);
    const velocityCount = await manager.getRepository(AppTransaction).count({
      where: {
        sender_user_id: actorUserId,
        status: 'COMPLETED',
        type: In(['TRANSFER', 'QR_PAYMENT', 'NFC_PAYMENT', 'WITHDRAW']),
        created_at: MoreThanOrEqual(velocityStart),
      },
    });
    // MVP: velocity uses completed outbounds only. When settlement uses async holds,
    // include debits / PENDING AppTransactions that reserve wallet balance.

    const rolling: RollingUsageSnapshot = {
      dailyOutflowDebitMad: Number(dailyRow?.amount ?? 0),
      monthlyOutflowDebitMad: Number(monthlyRow?.amount ?? 0),
      dailyWithdrawalCompletedMad: Number(dailyWithdrawRow?.total ?? 0),
      monthlyWithdrawalCompletedMad: Number(monthlyWithdrawRow?.total ?? 0),
      completedOutboundCountInWindow: velocityCount,
    };

    const result = evaluateKycMoneyMovementPolicy({
      normalizedKycStatus: normalizedStatus,
      tierKey,
      operation,
      amountMad,
      ledgerBalanceMad,
      senderCountryCode: senderCountry,
      receiverAccountType: receiver?.account_type ?? null,
      receiverUserId: receiver?.id ?? null,
      rolling,
      tierLimits,
      adminOverride: override,
    });

    if (
      result.ok &&
      operation === 'QR_PAYMENT' &&
      normalizedStatus === 'VERIFIED' &&
      this.subscriptionLimits
    ) {
      if (!override?.bypass_all_limits) {
        await this.subscriptionLimits.assertQrDailyLimit({
          manager,
          userId: actorUserId,
          amountMad,
          rewardsTier: user.rewards_tier,
        });
      }
    }

    if (!result.ok) {
      await this.auditService
        .audit({
          actorUserId: actorUserId,
          action: 'KYC_POLICY_DENIED',
          targetType: 'USER',
          targetId: actorUserId,
          metadata: {
            ...mergeDenialForAudit(result.denial),
            operation,
            tier_key: tierKey,
            ...((params.auditContext ?? {}) as Record<string, unknown>),
          },
          req: params.req ?? null,
        })
        .catch(() => {});
      throw new ForbiddenException({
        error: result.denial.code,
        message: result.denial.message,
      });
    }
  }

  private async loadMergedOverrides(userId: string): Promise<AdminOverrideEffective | null> {
    const rows = await this.overrideRepo.find({
      where: { user_id: userId, active: true },
      order: { created_at: 'DESC' },
    });
    return this.mergeOverrideRows(rows);
  }

  private async loadMergedOverridesWithManager(
    manager: EntityManager,
    userId: string,
  ): Promise<AdminOverrideEffective | null> {
    const rows = await manager.getRepository(KycAdminOverride).find({
      where: { user_id: userId, active: true },
      order: { created_at: 'DESC' },
    });
    return this.mergeOverrideRows(rows);
  }

  private mergeOverrideRows(rows: KycAdminOverride[]): AdminOverrideEffective | null {
    const now = Date.now();
    const active = rows.filter(
      (r) => !r.expires_at || r.expires_at.getTime() > now,
    );
    if (active.length === 0) return null;
    const extraCountries = active.flatMap((r) =>
      Array.isArray(r.extra_allowed_country_codes)
        ? r.extra_allowed_country_codes
        : [],
    );
    return {
      bypass_kyc_status_gate: active.some((r) => r.bypass_kyc_status_gate),
      bypass_all_limits: active.some((r) => isBypassAllLimitsEffective(r)),
      boost_daily_outflow_mad: active.reduce(
        (s, r) => s + num(r.boost_daily_outflow_mad),
        0,
      ),
      boost_monthly_outflow_mad: active.reduce(
        (s, r) => s + num(r.boost_monthly_outflow_mad),
        0,
      ),
      boost_max_single_transfer_mad: active.reduce(
        (s, r) => s + num(r.boost_max_single_transfer_mad),
        0,
      ),
      boost_daily_withdrawal_mad: active.reduce(
        (s, r) => s + num(r.boost_daily_withdrawal_mad),
        0,
      ),
      boost_monthly_withdrawal_mad: active.reduce(
        (s, r) => s + num(r.boost_monthly_withdrawal_mad),
        0,
      ),
      extra_allowed_country_codes: [
        ...new Set(extraCountries.map((c) => String(c).trim().toUpperCase())),
      ],
    };
  }
}
