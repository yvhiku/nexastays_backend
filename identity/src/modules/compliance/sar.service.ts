import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { SarReport } from './entities/sar-report.entity';
import { FraudEvent } from '../fraud/entities/fraud-event.entity';
import { AuditService } from '../audit/audit.service';
import { SarQueryDto } from './dto/sar.query.dto';

export interface SarDeviceContext {
  device_id?: string;
  device_integrity?: string;
  user_agent?: string;
}

export interface SarEvaluationInput {
  user_id: string;
  transaction_id?: string | null;
  transaction_reference?: string | null;
  highest_risk_score: number;
  reason_codes: string[];
  device_context?: SarDeviceContext;
}

@Injectable()
export class SarService {
  constructor(
    @InjectRepository(SarReport)
    private readonly sarRepository: Repository<SarReport>,
    @InjectRepository(FraudEvent)
    private readonly fraudEventRepository: Repository<FraudEvent>,
    private readonly auditService: AuditService,
  ) {}

  private get riskScoreThreshold(): number {
    return Number(process.env.SAR_RISK_SCORE_THRESHOLD ?? 75);
  }

  private get repeatedPatternThreshold(): number {
    return Number(process.env.SAR_REPEATED_PATTERN_THRESHOLD ?? 3);
  }

  private get repeatedPatternWindowHours(): number {
    return Number(process.env.SAR_REPEATED_PATTERN_WINDOW_HOURS ?? 24);
  }

  private get suspiciousReasonCodes(): string[] {
    const raw =
      process.env.SAR_SUSPICIOUS_REASON_CODES ??
      'FAILED_PIN_THEN_HIGH_VALUE,VELOCITY_THRESHOLD_EXCEEDED,RAPID_BALANCE_DRAIN_DETECTED';
    return raw
      .split(',')
      .map((code) => code.trim())
      .filter(Boolean);
  }

  async evaluateAndCreate(
    input: SarEvaluationInput,
  ): Promise<SarReport | null> {
    const thresholdExceeded =
      input.highest_risk_score >= this.riskScoreThreshold;
    const repeatedPatternDetected =
      await this.hasRepeatedSuspiciousPatterns(input);
    if (!thresholdExceeded && !repeatedPatternDetected) {
      return null;
    }

    const riskReason = thresholdExceeded
      ? `RISK_SCORE_THRESHOLD_EXCEEDED:${input.reason_codes.join('|')}`
      : `REPEATED_SUSPICIOUS_PATTERN:${input.reason_codes.join('|')}`;
    const reportPayload = {
      userId: input.user_id,
      transactionId: input.transaction_id ?? null,
      transactionReference: input.transaction_reference ?? null,
      risk_reason: riskReason,
      risk_score: input.highest_risk_score,
      timestamp: new Date().toISOString(),
      device_context: input.device_context ?? {},
      trigger_type: thresholdExceeded ? 'RISK_SCORE' : 'REPEATED_PATTERN',
      source: 'fraud_rules_engine',
    };

    const sar = this.sarRepository.create({
      user_id: input.user_id,
      transaction_id: input.transaction_id ?? null,
      risk_reason: riskReason.slice(0, 120),
      risk_score: input.highest_risk_score,
      device_context: (input.device_context as Record<string, unknown>) ?? null,
      report_payload: reportPayload,
      status: 'OPEN',
    });
    const savedSar = await this.sarRepository.save(sar);

    await this.auditService
      .audit({
        actorUserId: input.user_id,
        action: 'SAR_CREATED',
        targetType: 'SAR_REPORT',
        targetId: savedSar.id,
        metadata: {
          transaction_id: input.transaction_id ?? null,
          risk_reason: riskReason,
          risk_score: input.highest_risk_score,
          trigger_type: thresholdExceeded ? 'RISK_SCORE' : 'REPEATED_PATTERN',
        },
      })
      .catch(() => {});

    return savedSar;
  }

  private async hasRepeatedSuspiciousPatterns(
    input: SarEvaluationInput,
  ): Promise<boolean> {
    const reasons = input.reason_codes.filter((reason) =>
      this.suspiciousReasonCodes.includes(reason),
    );
    if (reasons.length === 0) return false;
    const windowStart = new Date(
      Date.now() - this.repeatedPatternWindowHours * 60 * 60 * 1000,
    );
    const count = await this.fraudEventRepository.count({
      where: {
        user_id: input.user_id,
        reason_code: In(reasons),
        created_at: MoreThanOrEqual(windowStart),
      },
    });
    return count >= this.repeatedPatternThreshold;
  }

  async listSarReports(query: SarQueryDto) {
    const where =
      query.status && query.status !== 'all' ? { status: query.status } : {};
    const rows = await this.sarRepository.find({
      where,
      order: { created_at: 'DESC' },
      take: 1000,
    });
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      transactionId: row.transaction_id,
      risk_reason: row.risk_reason,
      risk_score: row.risk_score,
      timestamp: row.created_at,
      device_context: row.device_context,
      status: row.status,
      report_payload: row.report_payload,
    }));
  }

  async exportSarReportsCsv(query: SarQueryDto): Promise<string> {
    const rows = await this.listSarReports({ ...query, format: 'json' });
    const headers = [
      'id',
      'userId',
      'transactionId',
      'risk_reason',
      'risk_score',
      'timestamp',
      'status',
      'device_context',
      'report_payload',
    ];
    const body = rows.map((row) => [
      row.id,
      row.userId,
      row.transactionId ?? '',
      row.risk_reason,
      row.risk_score,
      row.timestamp instanceof Date
        ? row.timestamp.toISOString()
        : String(row.timestamp),
      row.status,
      JSON.stringify(row.device_context ?? {}),
      JSON.stringify(row.report_payload ?? {}),
    ]);
    return [
      headers.join(','),
      ...body.map((line) =>
        line.map((value) => this.escapeCsv(value)).join(','),
      ),
    ].join('\n');
  }

  async updateSarStatus(id: string, status: string, adminUserId?: string) {
    const sar = await this.sarRepository.findOne({ where: { id } });
    if (!sar) {
      throw new NotFoundException('SAR report not found');
    }
    sar.status = status;
    const saved = await this.sarRepository.save(sar);
    await this.auditService
      .audit({
        actorUserId: adminUserId ?? null,
        action: 'SAR_STATUS_UPDATED',
        targetType: 'SAR_REPORT',
        targetId: saved.id,
        metadata: { status: saved.status },
      })
      .catch(() => {});
    return {
      id: saved.id,
      status: saved.status,
      updated_at: saved.updated_at,
    };
  }

  private escapeCsv(value: unknown): string {
    if (value == null) return '';
    const text = String(value);
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }
}
