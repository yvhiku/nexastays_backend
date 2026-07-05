import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { AppTransaction } from '../transactions/entities/app-transaction.entity';
import { TrustedDevice } from '../auth/entities/trusted-device.entity';
import { KycProfile } from '../compliance/entities/kyc-profile.entity';
import { TransactionLimit } from '../compliance/entities/transaction-limit.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { RiskAlert } from '../admin/entities/risk-alert.entity';
import { FraudEvent } from './entities/fraud-event.entity';
import { SarService, type SarDeviceContext } from '../compliance/sar.service';
import { SecurityEventsService } from '../security-events/security-events.service';
import {
  evaluateFraudRules,
  type FraudRuleContext,
  type FraudRuleResult,
  type FraudRulesConfig,
} from './fraud.rules';

export interface FraudEvaluationInput {
  sender_user_id: string;
  amount: number;
  transaction_type: string;
  transaction_id?: string | null;
  transaction_reference?: string | null;
  device_id?: string | null;
  device_context?: SarDeviceContext;
}

export interface FraudEvaluationDecision {
  blocked: boolean;
  highest_severity: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  highest_risk_score: number;
  events: FraudRuleResult[];
}

@Injectable()
export class FraudService {
  constructor(
    @InjectRepository(FraudEvent)
    private readonly fraudEventRepository: Repository<FraudEvent>,
    @InjectRepository(AppTransaction)
    private readonly transactionRepository: Repository<AppTransaction>,
    @InjectRepository(TrustedDevice)
    private readonly trustedDeviceRepository: Repository<TrustedDevice>,
    @InjectRepository(KycProfile)
    private readonly kycRepository: Repository<KycProfile>,
    @InjectRepository(TransactionLimit)
    private readonly transactionLimitRepository: Repository<TransactionLimit>,
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
    @InjectRepository(RiskAlert)
    private readonly riskAlertRepository: Repository<RiskAlert>,
    private readonly sarService: SarService,
    private readonly securityEventsService: SecurityEventsService,
  ) {}

  /** Fraud pre-check tier cap — uses legacy transaction_limits when tier policy is unavailable. */
  private async getMaxSingleTransferMadForTier(
    tierKey: string | null | undefined,
  ): Promise<number | null> {
    const key = (tierKey ?? 'NONE').trim().toUpperCase() || 'NONE';
    const legacy = await this.transactionLimitRepository.findOne({
      where: { kyc_level: key },
    });
    if (legacy?.daily_limit != null) {
      return typeof legacy.daily_limit === 'number'
        ? legacy.daily_limit
        : Number(legacy.daily_limit);
    }
    return null;
  }

  private get rulesConfig(): FraudRulesConfig {
    return {
      velocity_max_transfers: Number(
        process.env.FRAUD_VELOCITY_MAX_TRANSFERS ?? 3,
      ),
      velocity_window_minutes: Number(
        process.env.FRAUD_VELOCITY_WINDOW_MINUTES ?? 5,
      ),
      rapid_drain_percent_threshold: Number(
        process.env.FRAUD_RAPID_DRAIN_PERCENT ?? 70,
      ),
      rapid_drain_window_minutes: Number(
        process.env.FRAUD_RAPID_DRAIN_WINDOW_MINUTES ?? 10,
      ),
      new_device_high_amount_threshold: Number(
        process.env.FRAUD_NEW_DEVICE_HIGH_AMOUNT ?? 1500,
      ),
      suspicious_failed_pin_count: Number(
        process.env.FRAUD_SUSPICIOUS_FAILED_PIN_COUNT ?? 3,
      ),
      suspicious_high_value_amount: Number(
        process.env.FRAUD_SUSPICIOUS_HIGH_VALUE_AMOUNT ?? 1200,
      ),
    };
  }

  async evaluateTransactionRisk(
    input: FraudEvaluationInput,
    senderBalance: number,
  ): Promise<FraudEvaluationDecision> {
    type TransferAmountSumRow = { total: string | null };

    const now = new Date();
    const config = this.rulesConfig;
    const velocityWindowStart = new Date(
      now.getTime() - config.velocity_window_minutes * 60 * 1000,
    );
    const drainWindowStart = new Date(
      now.getTime() - config.rapid_drain_window_minutes * 60 * 1000,
    );
    const pinPatternWindowStart = new Date(now.getTime() - 30 * 60 * 1000);

    const [
      recentTransferCount,
      recentTransferAmount,
      hasNewlyTrustedDevice,
      kyc,
    ] = await Promise.all([
      this.transactionRepository.count({
        where: {
          sender_user_id: input.sender_user_id,
          status: 'COMPLETED',
          created_at: MoreThanOrEqual(velocityWindowStart),
        },
      }),
      this.transactionRepository
        .createQueryBuilder('t')
        .select('COALESCE(SUM(t.amount), 0)', 'total')
        .where('t.sender_user_id = :senderUserId', {
          senderUserId: input.sender_user_id,
        })
        .andWhere('t.status = :status', { status: 'COMPLETED' })
        .andWhere('t.created_at >= :windowStart', {
          windowStart: drainWindowStart,
        })
        .getRawOne<TransferAmountSumRow>(),
      this.hasTrustedDeviceLessThan24h(input.sender_user_id, input.device_id),
      this.kycRepository.findOne({ where: { user_id: input.sender_user_id } }),
    ]);

    const tierLimit = kyc?.level
      ? await this.getMaxSingleTransferMadForTier(kyc.level)
      : null;
    const recentFailedPinAttempts = await this.auditRepository.count({
      where: {
        user_id: input.sender_user_id,
        action: 'PIN_VERIFY_FAILED',
        created_at: MoreThanOrEqual(pinPatternWindowStart),
      },
    });

    const context: FraudRuleContext = {
      amount: input.amount,
      sender_balance: senderBalance,
      recent_transfer_count: recentTransferCount,
      recent_transfer_window_minutes: config.velocity_window_minutes,
      recent_transfer_amount: Number(recentTransferAmount?.total ?? 0),
      rapid_drain_window_minutes: config.rapid_drain_window_minutes,
      kyc_tier_limit: tierLimit,
      has_newly_trusted_device: hasNewlyTrustedDevice,
      recent_failed_pin_attempts: recentFailedPinAttempts,
      now,
    };

    const events = evaluateFraudRules(context, config);
    if (events.length === 0) {
      return {
        blocked: false,
        highest_severity: null,
        highest_risk_score: 0,
        events: [],
      };
    }

    await this.persistFraudEvents(input, events);
    const decision = this.toDecision(events);
    await this.sarService.evaluateAndCreate({
      user_id: input.sender_user_id,
      transaction_id: input.transaction_id ?? null,
      transaction_reference: input.transaction_reference ?? null,
      highest_risk_score: decision.highest_risk_score,
      reason_codes: events.map((event) => event.reason_code),
      device_context: input.device_context ?? {
        device_id: input.device_id ?? undefined,
      },
    });
    return decision;
  }

  private async hasTrustedDeviceLessThan24h(
    userId: string,
    deviceId?: string | null,
  ): Promise<boolean> {
    const normalized = (deviceId || '').trim();
    if (!normalized) return false;
    const minSeenAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const trustedDevice = await this.trustedDeviceRepository.findOne({
      where: {
        user_id: userId,
        device_id: normalized.slice(0, 120),
        trusted: true,
        first_seen_at: MoreThanOrEqual(minSeenAt),
      },
    });
    return !!trustedDevice;
  }

  private toDecision(events: FraudRuleResult[]): FraudEvaluationDecision {
    const hasHigh = events.some((event) => event.severity === 'HIGH');
    const hasMedium = events.some((event) => event.severity === 'MEDIUM');
    const highestSeverity = hasHigh ? 'HIGH' : hasMedium ? 'MEDIUM' : 'LOW';
    const highestRiskScore = events.reduce(
      (max, event) => Math.max(max, event.risk_score),
      0,
    );
    return {
      blocked: hasHigh,
      highest_severity: highestSeverity,
      highest_risk_score: highestRiskScore,
      events,
    };
  }

  private async persistFraudEvents(
    input: FraudEvaluationInput,
    events: FraudRuleResult[],
  ): Promise<void> {
    const highestSeverity = this.toDecision(events).highest_severity;
    const action =
      highestSeverity === 'HIGH'
        ? 'BLOCKED'
        : highestSeverity === 'MEDIUM'
          ? 'ALLOW_REVIEW'
          : 'ALLOW';

    await this.fraudEventRepository.save(
      events.map((event) => ({
        user_id: input.sender_user_id,
        transaction_type: input.transaction_type,
        amount: input.amount,
        risk_score: event.risk_score,
        reason_code: event.reason_code,
        severity: event.severity,
        action,
        metadata: event.metadata ?? null,
      })),
    );

    for (const event of events) {
      await this.securityEventsService.logEvent({
        user_id: input.sender_user_id,
        event_type: 'FRAUD_FLAG',
        metadata: {
          reason_code: event.reason_code,
          severity: event.severity,
          risk_score: event.risk_score,
          transaction_type: input.transaction_type,
          transaction_id: input.transaction_id ?? null,
          transaction_reference: input.transaction_reference ?? null,
          action,
        },
        device_id: input.device_id ?? null,
      });
    }

    if (highestSeverity === 'MEDIUM') {
      await this.riskAlertRepository.save({
        type: 'FRAUD_RULE_MEDIUM',
        severity: 'MEDIUM',
        user_id: input.sender_user_id,
        transaction_id: input.transaction_id ?? null,
        amount: input.amount,
        transaction_reference: input.transaction_reference ?? null,
        description: events.map((event) => event.reason_code).join(', '),
        risk_score: Math.max(...events.map((event) => event.risk_score)),
        status: 'OPEN',
      });
    }
  }
}
