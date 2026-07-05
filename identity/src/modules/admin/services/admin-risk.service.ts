import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RiskAlert } from '../entities/risk-alert.entity';
import { AdminRiskQueryDto } from '../dto/admin-risk.query.dto';
import { AdminMonitoringQueryDto } from '../dto/admin-monitoring.query.dto';
import { AppTransaction } from '../../transactions/entities/app-transaction.entity';
import { User } from '../../users/entities/user.entity';
import { AdminAuditService } from './admin-audit.service';
import { FraudEvent } from '../../fraud/entities/fraud-event.entity';
import { SarReport } from '../../compliance/entities/sar-report.entity';
import { ReconciliationIssue } from '../../reconciliation/entities/reconciliation-issue.entity';

interface RequestUser {
  userId?: string;
  email?: string;
}

@Injectable()
export class AdminRiskService {
  constructor(
    @InjectRepository(RiskAlert)
    private readonly riskRepository: Repository<RiskAlert>,
    @InjectRepository(FraudEvent)
    private readonly fraudEventRepository: Repository<FraudEvent>,
    @InjectRepository(SarReport)
    private readonly sarReportRepository: Repository<SarReport>,
    @InjectRepository(ReconciliationIssue)
    private readonly reconciliationIssueRepository: Repository<ReconciliationIssue>,
    @InjectRepository(AppTransaction)
    private readonly transactionsRepository: Repository<AppTransaction>,
    private readonly auditService: AdminAuditService,
  ) {}

  private toWindow(query: AdminMonitoringQueryDto): {
    from?: Date;
    to?: Date;
  } {
    return {
      from: query.from_date ? new Date(query.from_date) : undefined,
      to: query.to_date ? new Date(query.to_date) : undefined,
    };
  }

  private toPaging(query: AdminMonitoringQueryDto): {
    page: number;
    limit: number;
  } {
    return {
      page: query.page ?? 1,
      limit: Math.min(query.limit ?? 50, 200),
    };
  }

  private applyDateRange(
    qb: ReturnType<Repository<any>['createQueryBuilder']>,
    alias: string,
    column: string,
    query: AdminMonitoringQueryDto,
  ) {
    const { from, to } = this.toWindow(query);
    if (from) {
      qb.andWhere(`${alias}.${column} >= :fromDate`, { fromDate: from });
    }
    if (to) {
      qb.andWhere(`${alias}.${column} <= :toDate`, { toDate: to });
    }
  }

  private applyCommonFilters(
    qb: ReturnType<Repository<any>['createQueryBuilder']>,
    alias: string,
    query: AdminMonitoringQueryDto,
  ) {
    this.applyDateRange(qb, alias, 'created_at', query);
    if (query.status && query.status !== 'all') {
      qb.andWhere(`${alias}.status = :status`, { status: query.status });
    }
    if (query.user_id) {
      qb.andWhere(`${alias}.user_id = :userId`, { userId: query.user_id });
    }
    if (query.transaction_id) {
      qb.andWhere(`${alias}.transaction_id = :transactionId`, {
        transactionId: query.transaction_id,
      });
    }
  }

  async getRiskSummary(query: AdminMonitoringQueryDto) {
    const riskAlertsQb = this.riskRepository.createQueryBuilder('r');
    this.applyDateRange(riskAlertsQb, 'r', 'created_at', query);
    if (query.severity && query.severity !== 'all') {
      riskAlertsQb.andWhere('r.severity = :severity', {
        severity: query.severity,
      });
    }

    const fraudQb = this.fraudEventRepository.createQueryBuilder('f');
    this.applyDateRange(fraudQb, 'f', 'created_at', query);
    if (query.severity && query.severity !== 'all') {
      fraudQb.andWhere('f.severity = :severity', { severity: query.severity });
    }

    const sarQb = this.sarReportRepository.createQueryBuilder('s');
    this.applyDateRange(sarQb, 's', 'created_at', query);
    if (query.severity && query.severity !== 'all') {
      const [min, max] =
        query.severity === 'HIGH'
          ? [80, null]
          : query.severity === 'MEDIUM'
            ? [50, 79]
            : [0, 49];
      sarQb.andWhere('s.risk_score >= :minRisk', { minRisk: min });
      if (max != null)
        sarQb.andWhere('s.risk_score <= :maxRisk', { maxRisk: max });
    }

    const recQb = this.reconciliationIssueRepository.createQueryBuilder('ri');
    this.applyDateRange(recQb, 'ri', 'created_at', query);
    if (query.severity && query.severity !== 'all') {
      recQb.andWhere('ri.severity = :severity', { severity: query.severity });
    }

    const [
      riskAlertCount,
      openRiskAlertCount,
      fraudEventCount,
      sarCount,
      openSarCount,
      reconciliationIssueCount,
      openReconciliationCount,
    ] = await Promise.all([
      riskAlertsQb.getCount(),
      riskAlertsQb
        .clone()
        .andWhere('r.status = :status', { status: 'OPEN' })
        .getCount(),
      fraudQb.getCount(),
      sarQb.getCount(),
      sarQb
        .clone()
        .andWhere('s.status IN (:...statuses)', {
          statuses: ['OPEN', 'UNDER_REVIEW'],
        })
        .getCount(),
      recQb.getCount(),
      recQb
        .clone()
        .andWhere('ri.status = :status', { status: 'OPEN' })
        .getCount(),
    ]);

    return {
      window: {
        from_date: query.from_date ?? null,
        to_date: query.to_date ?? null,
        severity: query.severity ?? 'all',
      },
      totals: {
        risk_alerts: riskAlertCount,
        fraud_events: fraudEventCount,
        sar_reports: sarCount,
        reconciliation_issues: reconciliationIssueCount,
      },
      open: {
        risk_alerts: openRiskAlertCount,
        sar_reports: openSarCount,
        reconciliation_issues: openReconciliationCount,
      },
    };
  }

  async getFraudEvents(query: AdminMonitoringQueryDto) {
    const { page, limit } = this.toPaging(query);
    const qb = this.fraudEventRepository
      .createQueryBuilder('f')
      .orderBy('f.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    this.applyCommonFilters(qb, 'f', query);
    if (query.severity && query.severity !== 'all') {
      qb.andWhere('f.severity = :severity', { severity: query.severity });
    }
    if (query.search) {
      qb.andWhere(
        '(f.reason_code ILIKE :search OR f.transaction_type ILIKE :search OR CAST(f.user_id AS text) ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    const [rows, total] = await Promise.all([qb.getMany(), qb.getCount()]);
    return {
      page,
      limit,
      total,
      data: rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        transaction_type: row.transaction_type,
        amount: Number(row.amount),
        risk_score: row.risk_score,
        reason_code: row.reason_code,
        severity: row.severity,
        action: row.action,
        status: row.status,
        assigned_owner: row.assigned_owner,
        internal_note: row.internal_note,
        metadata: row.metadata,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
    };
  }

  async getSarReports(query: AdminMonitoringQueryDto) {
    const { page, limit } = this.toPaging(query);
    const qb = this.sarReportRepository
      .createQueryBuilder('s')
      .orderBy('s.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    this.applyCommonFilters(qb, 's', query);
    if (query.severity && query.severity !== 'all') {
      const [min, max] =
        query.severity === 'HIGH'
          ? [80, null]
          : query.severity === 'MEDIUM'
            ? [50, 79]
            : [0, 49];
      qb.andWhere('s.risk_score >= :minRisk', { minRisk: min });
      if (max != null)
        qb.andWhere('s.risk_score <= :maxRisk', { maxRisk: max });
    }
    if (query.search) {
      qb.andWhere(
        '(s.risk_reason ILIKE :search OR CAST(s.user_id AS text) ILIKE :search OR CAST(s.transaction_id AS text) ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    const [rows, total] = await Promise.all([qb.getMany(), qb.getCount()]);
    return {
      page,
      limit,
      total,
      data: rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        transaction_id: row.transaction_id,
        risk_reason: row.risk_reason,
        risk_score: row.risk_score,
        severity:
          row.risk_score >= 80
            ? 'HIGH'
            : row.risk_score >= 50
              ? 'MEDIUM'
              : 'LOW',
        status: row.status,
        device_context: row.device_context,
        created_at: row.created_at,
      })),
    };
  }

  async getReconciliationIssues(query: AdminMonitoringQueryDto) {
    const { page, limit } = this.toPaging(query);
    const qb = this.reconciliationIssueRepository
      .createQueryBuilder('ri')
      .orderBy('ri.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    this.applyCommonFilters(qb, 'ri', query);
    if (query.severity && query.severity !== 'all') {
      qb.andWhere('ri.severity = :severity', { severity: query.severity });
    }
    if (query.search) {
      qb.andWhere(
        '(ri.issue_type ILIKE :search OR ri.description ILIKE :search OR CAST(ri.id AS text) ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    const [rows, total] = await Promise.all([qb.getMany(), qb.getCount()]);
    return {
      page,
      limit,
      total,
      data: rows.map((row) => ({
        id: row.id,
        report_date: row.report_date,
        issue_type: row.issue_type,
        severity: row.severity,
        description: row.description,
        status: row.status,
        metadata: row.metadata,
        created_at: row.created_at,
      })),
    };
  }

  async getAlerts(query: AdminRiskQueryDto) {
    const qb = this.riskRepository
      .createQueryBuilder('alert')
      .leftJoin(User, 'u', 'u.id = alert.user_id')
      .leftJoin(AppTransaction, 'tx', 'tx.id = alert.transaction_id')
      .select([
        'alert.id as id',
        'alert.type as type',
        'alert.severity as severity',
        'alert.user_id as user_id',
        'u.phone_number as user_phone',
        'alert.transaction_id as transaction_id',
        'alert.transaction_reference as transaction_reference',
        'alert.description as description',
        'alert.risk_score as risk_score',
        'alert.status as status',
        'alert.created_at as created_at',
        'alert.amount as alert_amount',
        'tx.amount as tx_amount',
        'tx.reference as tx_reference',
      ])
      .orderBy('alert.created_at', 'DESC');

    if (query.status && query.status !== 'all') {
      qb.andWhere('alert.status = :status', { status: query.status });
    }

    if (query.severity && query.severity !== 'all') {
      qb.andWhere('alert.severity = :severity', { severity: query.severity });
    }

    const rows = await qb.getRawMany();
    return rows.map((row) => {
      const fromAlert = row.alert_amount != null ? Number(row.alert_amount) : null;
      const fromTx = row.tx_amount != null ? Number(row.tx_amount) : null;
      const amount = fromAlert ?? fromTx ?? null;
      const reference =
        (row.transaction_reference as string | null)?.trim() ||
        (row.tx_reference as string | null)?.trim() ||
        null;
      return {
        id: row.id,
        type: row.type,
        severity: row.severity,
        user_id: row.user_id,
        user_phone: row.user_phone,
        transaction_id: row.transaction_id,
        transaction_reference: reference,
        description: row.description,
        risk_score: Number(row.risk_score || 0),
        status: row.status,
        created_at: row.created_at,
        amount,
      };
    });
  }

  async getStats() {
    const [totalAlerts, highSeverity, openCases] = await Promise.all([
      this.riskRepository.count(),
      this.riskRepository.count({ where: { severity: 'HIGH' } }),
      this.riskRepository.count({ where: { status: 'OPEN' } }),
    ]);

    const avgRow = await this.riskRepository
      .createQueryBuilder('alert')
      .select('COALESCE(AVG(alert.risk_score), 0)', 'avg')
      .getRawOne();

    return {
      totalAlerts,
      highSeverity,
      openCases,
      avgRiskScore: Number(avgRow?.avg || 0),
    };
  }

  async escalate(alertId: string, adminUser?: RequestUser) {
    const alert = await this.riskRepository.findOne({ where: { id: alertId } });
    if (!alert) {
      throw new NotFoundException('Risk alert not found');
    }

    alert.status = 'INVESTIGATING';
    await this.riskRepository.save(alert);

    await this.auditService.logAction({
      action: 'RISK_ALERT_ESCALATED',
      entityType: 'risk_alert',
      entityId: alert.id,
      userId: alert.user_id ?? undefined,
      adminUser,
    });

    return { success: true };
  }

  async flagTransaction(
    transactionId: string,
    reason: string,
    adminUser?: RequestUser,
  ) {
    const transaction = await this.transactionsRepository.findOne({
      where: { id: transactionId },
    });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    const alert = this.riskRepository.create({
      type: 'MANUAL_FLAG',
      severity: 'MEDIUM',
      user_id: transaction.sender_user_id,
      transaction_id: transaction.id,
      amount: Number(transaction.amount),
      transaction_reference: transaction.reference,
      description: reason,
      risk_score: 50,
      status: 'OPEN',
    });
    await this.riskRepository.save(alert);

    await this.auditService.logAction({
      action: 'TRANSACTION_FLAGGED',
      entityType: 'transaction',
      entityId: transaction.id,
      userId: transaction.sender_user_id ?? undefined,
      metadata: { reason },
      adminUser,
    });

    return { success: true };
  }

  async updateFraudEventStatus(
    id: string,
    payload: {
      status: 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'FALSE_POSITIVE';
      assigned_owner?: string;
      internal_note?: string;
    },
    adminUser?: RequestUser,
  ) {
    const row = await this.fraudEventRepository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('Fraud event not found');
    }
    row.status = payload.status;
    if (payload.assigned_owner !== undefined) {
      row.assigned_owner = payload.assigned_owner || null;
    }
    if (payload.internal_note !== undefined) {
      row.internal_note = payload.internal_note || null;
    }
    await this.fraudEventRepository.save(row);
    await this.auditService.logAction({
      action: 'FRAUD_EVENT_STATUS_UPDATED',
      entityType: 'fraud_event',
      entityId: row.id,
      userId: row.user_id,
      metadata: {
        status: row.status,
        assigned_owner: row.assigned_owner,
      },
      adminUser,
    });
    return { success: true };
  }

  async updateSarStatus(
    id: string,
    status: string,
    adminUser?: RequestUser,
  ) {
    const row = await this.sarReportRepository.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('SAR report not found');
    }
    const normalized =
      status === 'NEW'
        ? 'OPEN'
        : status === 'IN_REVIEW'
          ? 'UNDER_REVIEW'
          : status === 'FILED'
            ? 'REPORTED'
            : status;
    row.status = normalized;
    await this.sarReportRepository.save(row);
    await this.auditService.logAction({
      action: 'SAR_STATUS_UPDATED_BY_ADMIN',
      entityType: 'sar_report',
      entityId: row.id,
      userId: row.user_id,
      metadata: { status: row.status },
      adminUser,
    });
    return { success: true };
  }

  async updateReconciliationIssueStatus(
    id: string,
    status: string,
    adminUser?: RequestUser,
  ) {
    const row = await this.reconciliationIssueRepository.findOne({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Reconciliation issue not found');
    }
    row.status = status;
    await this.reconciliationIssueRepository.save(row);
    await this.auditService.logAction({
      action: 'RECONCILIATION_ISSUE_STATUS_UPDATED',
      entityType: 'reconciliation_issue',
      entityId: row.id,
      metadata: { status: row.status },
      adminUser,
    });
    return { success: true };
  }
}
