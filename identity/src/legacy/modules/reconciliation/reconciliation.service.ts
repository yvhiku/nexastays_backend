import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LedgerEntry } from '../ledger/entities/ledger-entry.entity';
import { LedgerAccount } from '../ledger/entities/ledger-account.entity';
import { LedgerTransaction } from '../ledger/entities/ledger-transaction.entity';
import { ReconciliationIssue } from './entities/reconciliation-issue.entity';
import { RiskAlert } from '../admin/entities/risk-alert.entity';
import { AuditService } from '../audit/audit.service';
import { safeLogger } from '../../common/logging/safe-logger';
import { LedgerService } from '../ledger/ledger.service';

type ReconciliationSummary = {
  debit_total: number;
  credit_total: number;
  difference: number;
};

type NegativeBalanceAccount = {
  account_id: string;
  account_type: string;
  system_account: boolean;
  balance: number;
};

export type DailyReconciliationReport = {
  report_date: string;
  generated_at: string;
  summary: ReconciliationSummary;
  checks: {
    debits_equal_credits: boolean;
    no_orphan_entries: boolean;
    no_unauthorized_negative_balances: boolean;
    suspense_balanced_or_fresh: boolean;
  };
  issue_count: number;
  issues: Array<{
    id: string;
    issue_type: string;
    severity: string;
    description: string;
    status: string;
    created_at: string;
    metadata: Record<string, unknown> | null;
  }>;
};

@Injectable()
export class ReconciliationService {
  constructor(
    @InjectRepository(LedgerEntry)
    private readonly ledgerEntryRepository: Repository<LedgerEntry>,
    @InjectRepository(LedgerAccount)
    private readonly ledgerAccountRepository: Repository<LedgerAccount>,
    @InjectRepository(ReconciliationIssue)
    private readonly reconciliationIssueRepository: Repository<ReconciliationIssue>,
    @InjectRepository(RiskAlert)
    private readonly riskAlertRepository: Repository<RiskAlert>,
    private readonly auditService: AuditService,
    private readonly ledgerService: LedgerService,
  ) {}

  @Cron('0 5 0 * * *', { timeZone: 'UTC' })
  async runDailyJob(): Promise<void> {
    try {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await this.runReconciliationForDate(yesterday);
    } catch (error) {
      safeLogger.error('Daily reconciliation job failed', error);
    }
  }

  async runReconciliationForDate(
    date: Date,
  ): Promise<DailyReconciliationReport> {
    const { start, end, reportDate } = this.getUtcDateWindow(date);
    const [summary, orphanCount, negativeBalances] = await Promise.all([
      this.calculateDailySums(start, end),
      this.countOrphanLedgerEntries(start, end),
      this.findUnauthorizedNegativeBalances(end),
    ]);

    const issues: ReconciliationIssue[] = [];
    if (summary.debit_total !== summary.credit_total) {
      issues.push(
        await this.createIssueAndAlert({
          reportDate,
          issueType: 'IMBALANCE',
          severity: 'HIGH',
          description: `Debit/Credit mismatch detected: debit=${summary.debit_total.toFixed(2)}, credit=${summary.credit_total.toFixed(2)}`,
          metadata: summary,
        }),
      );
    }

    if (orphanCount > 0) {
      issues.push(
        await this.createIssueAndAlert({
          reportDate,
          issueType: 'ORPHAN_ENTRIES',
          severity: 'HIGH',
          description: `Found ${orphanCount} orphan ledger entries`,
          metadata: { orphan_count: orphanCount },
        }),
      );
    }

    if (negativeBalances.length > 0) {
      issues.push(
        await this.createIssueAndAlert({
          reportDate,
          issueType: 'NEGATIVE_BALANCE',
          severity: 'MEDIUM',
          description: `Found ${negativeBalances.length} unauthorized negative balances`,
          metadata: {
            account_count: negativeBalances.length,
            sample_accounts: negativeBalances.slice(0, 20),
          },
        }),
      );
    }

    const suspenseIssue = await this.evaluateSuspenseAgingForReport(reportDate);
    if (suspenseIssue) {
      issues.push(suspenseIssue);
    }

    return {
      report_date: reportDate,
      generated_at: new Date().toISOString(),
      summary,
      checks: {
        debits_equal_credits: summary.debit_total === summary.credit_total,
        no_orphan_entries: orphanCount === 0,
        no_unauthorized_negative_balances: negativeBalances.length === 0,
        suspense_balanced_or_fresh: suspenseIssue == null,
      },
      issue_count: issues.length,
      issues: issues.map((issue) => ({
        id: issue.id,
        issue_type: issue.issue_type,
        severity: issue.severity,
        description: issue.description,
        status: issue.status,
        created_at: issue.created_at.toISOString(),
        metadata: issue.metadata,
      })),
    };
  }

  async exportReportCsv(date: Date): Promise<string> {
    const report = await this.runReconciliationForDate(date);
    const lines = [
      ['report_date', report.report_date],
      ['generated_at', report.generated_at],
      ['debit_total', report.summary.debit_total.toFixed(2)],
      ['credit_total', report.summary.credit_total.toFixed(2)],
      ['difference', report.summary.difference.toFixed(2)],
      ['debits_equal_credits', String(report.checks.debits_equal_credits)],
      ['no_orphan_entries', String(report.checks.no_orphan_entries)],
      [
        'no_unauthorized_negative_balances',
        String(report.checks.no_unauthorized_negative_balances),
      ],
      [
        'suspense_balanced_or_fresh',
        String(report.checks.suspense_balanced_or_fresh),
      ],
      ['issue_count', String(report.issue_count)],
      [''],
      [
        'issue_id',
        'issue_type',
        'severity',
        'description',
        'status',
        'created_at',
        'metadata',
      ],
      ...report.issues.map((issue) => [
        issue.id,
        issue.issue_type,
        issue.severity,
        issue.description,
        issue.status,
        issue.created_at,
        JSON.stringify(issue.metadata ?? {}),
      ]),
    ];
    return lines
      .map((row) => row.map((value) => this.escapeCsv(value)).join(','))
      .join('\n');
  }

  private async calculateDailySums(
    start: Date,
    end: Date,
  ): Promise<ReconciliationSummary> {
    const row = await this.ledgerEntryRepository
      .createQueryBuilder('le')
      .select(
        "COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0)",
        'debit_total',
      )
      .addSelect(
        "COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0)",
        'credit_total',
      )
      .where('le.created_at >= :start', { start })
      .andWhere('le.created_at < :end', { end })
      .getRawOne<{ debit_total: string; credit_total: string }>();
    const debitTotal = Number(row?.debit_total ?? 0);
    const creditTotal = Number(row?.credit_total ?? 0);
    return {
      debit_total: debitTotal,
      credit_total: creditTotal,
      difference: Number((debitTotal - creditTotal).toFixed(2)),
    };
  }

  private async countOrphanLedgerEntries(
    start: Date,
    end: Date,
  ): Promise<number> {
    const orphanTransactionCount = await this.ledgerEntryRepository
      .createQueryBuilder('le')
      .leftJoin(LedgerTransaction, 'lt', 'lt.id = le.transaction_id')
      .where('le.created_at >= :start', { start })
      .andWhere('le.created_at < :end', { end })
      .andWhere('lt.id IS NULL')
      .getCount();
    const orphanAccountCount = await this.ledgerEntryRepository
      .createQueryBuilder('le')
      .leftJoin(LedgerAccount, 'la', 'la.id = le.account_id')
      .where('le.created_at >= :start', { start })
      .andWhere('le.created_at < :end', { end })
      .andWhere('la.id IS NULL')
      .getCount();
    return orphanTransactionCount + orphanAccountCount;
  }

  private async findUnauthorizedNegativeBalances(
    end: Date,
  ): Promise<NegativeBalanceAccount[]> {
    const rows = await this.ledgerAccountRepository
      .createQueryBuilder('la')
      .leftJoin(
        LedgerEntry,
        'le',
        'le.account_id = la.id AND le.created_at < :end',
        {
          end,
        },
      )
      .where('la.allow_negative = :allowNeg', { allowNeg: false })
      .select('la.id', 'account_id')
      .addSelect('la.account_type', 'account_type')
      .addSelect('la.system_account', 'system_account')
      .addSelect(
        `CASE WHEN la.normal_balance = 'DEBIT' THEN
          COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE -le.amount END), 0)
        ELSE
          COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE -le.amount END), 0)
        END`,
        'signed_balance',
      )
      .groupBy('la.id')
      .addGroupBy('la.account_type')
      .addGroupBy('la.system_account')
      .addGroupBy('la.normal_balance')
      .having(
        `CASE WHEN la.normal_balance = 'DEBIT' THEN
          COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE -le.amount END), 0)
        ELSE
          COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE -le.amount END), 0)
        END < 0`,
      )
      .getRawMany<{
        account_id: string;
        account_type: string;
        system_account: boolean;
        signed_balance: string;
      }>();

    return rows.map((row) => ({
      account_id: row.account_id,
      account_type: row.account_type,
      system_account: Boolean(row.system_account),
      balance: Number(row.signed_balance),
    }));
  }

  /**
   * Point-in-time Nexa Pay ledger control figures (operational — not statutory accounting).
   */
  async getPayLedgerControlDashboard(): Promise<{
    generated_at: string;
    customer_liabilities_signed_total_mad: number;
    safeguarding_mirror_signed_total_mad: number;
    company_revenue_signed_balance_mad: number;
    fees_revenue_signed_balance_mad: number;
    suspense_signed_balance_mad: number;
    residual_safeguarding_minus_customers_mad: number;
    note: string;
  }> {
    const customer = await this.sumWalletCustomerLiabilitiesSigned();
    const safeAccounts = await this.ledgerAccountRepository.find({
      where: [
        { system_account: true, account_type: 'SAFEGUARDING_MIRROR' },
        { system_account: true, account_type: 'SYSTEM_MAIN' },
      ],
    });
    let safeguarding = 0;
    for (const a of safeAccounts) {
      safeguarding += await this.ledgerService.getSignedBalance(a);
    }
    const suspenseAcc = await this.ledgerAccountRepository.findOne({
      where: { system_account: true, account_type: 'SUSPENSE' },
    });
    const companyRevenueAcc = await this.ledgerAccountRepository.findOne({
      where: { system_account: true, account_type: 'COMPANY_REVENUE' },
    });
    const feesAcc = await this.ledgerAccountRepository.findOne({
      where: { system_account: true, account_type: 'FEES' },
    });
    const suspenseSigned = suspenseAcc
      ? await this.ledgerService.getSignedBalance(suspenseAcc)
      : 0;
    const companyRevenueSigned = companyRevenueAcc
      ? await this.ledgerService.getSignedBalance(companyRevenueAcc)
      : 0;
    const feesSigned = feesAcc
      ? await this.ledgerService.getSignedBalance(feesAcc)
      : 0;
    return {
      generated_at: new Date().toISOString(),
      customer_liabilities_signed_total_mad: customer,
      safeguarding_mirror_signed_total_mad: safeguarding,
      company_revenue_signed_balance_mad: companyRevenueSigned,
      fees_revenue_signed_balance_mad: feesSigned,
      suspense_signed_balance_mad: suspenseSigned,
      residual_safeguarding_minus_customers_mad: Number(
        (safeguarding - customer).toFixed(2),
      ),
      note:
        'In the simple mirror model, safeguarding and customer-liability signed totals typically move together; drift indicates fees/rewards/manual journals — investigate with finance.',
    };
  }

  /** Stale SUSPENSE activity with non-zero balance (see SUSPENSE_AGING_ALERT_DAYS). */
  private async evaluateSuspenseAgingForReport(
    reportDate: string,
  ): Promise<ReconciliationIssue | null> {
    const suspense = await this.ledgerAccountRepository.findOne({
      where: { system_account: true, account_type: 'SUSPENSE' },
    });
    if (!suspense) {
      return null;
    }
    const days = Number.parseInt(
      process.env.SUSPENSE_AGING_ALERT_DAYS || '7',
      10,
    );
    const cutoff = new Date(Date.now() - days * 86400000);
    const staleActivity = await this.ledgerEntryRepository
      .createQueryBuilder('le')
      .innerJoin(LedgerTransaction, 'lt', 'lt.id = le.transaction_id')
      .where('le.account_id = :id', { id: suspense.id })
      .andWhere('le.created_at < :cutoff', { cutoff })
      .getCount();
    const signed = await this.ledgerService.getSignedBalance(suspense);
    const significant = Math.abs(signed) > 0.009;
    if (staleActivity > 0 && significant) {
      return this.createIssueAndAlert({
        reportDate,
        issueType: 'SUSPENSE_AGING',
        severity: 'MEDIUM',
        description: `SUSPENSE balance ${signed.toFixed(
          2,
        )} MAD with postings older than ${days} day(s); ops should clear bridging entries`,
        metadata: {
          suspense_signed_balance: signed,
          stale_line_count_estimate: staleActivity,
          cutoff_iso: cutoff.toISOString(),
        },
      });
    }
    return null;
  }

  private async sumWalletCustomerLiabilitiesSigned(): Promise<number> {
    const row = await this.ledgerEntryRepository
      .createQueryBuilder('le')
      .innerJoin(LedgerAccount, 'la', 'la.id = le.account_id')
      .select(
        `COALESCE(SUM(
          CASE WHEN la.normal_balance = 'CREDIT' THEN
            CASE WHEN le.entry_type = 'CREDIT' THEN le.amount::numeric ELSE -le.amount::numeric END
          ELSE
            CASE WHEN le.entry_type = 'DEBIT' THEN le.amount::numeric ELSE -le.amount::numeric END
          END
        ), 0)`,
        't',
      )
      .where('la.wallet_id IS NOT NULL')
      .andWhere("la.account_type IN ('CUSTOMER_LIABILITY','WALLET')")
      .getRawOne<{ t: string }>();
    return Number(row?.t ?? 0);
  }

  private async createIssueAndAlert(params: {
    reportDate: string;
    issueType: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    description: string;
    metadata: Record<string, unknown>;
  }): Promise<ReconciliationIssue> {
    const issue = await this.reconciliationIssueRepository.save({
      report_date: params.reportDate,
      issue_type: params.issueType,
      severity: params.severity,
      description: params.description,
      metadata: params.metadata,
      status: 'OPEN',
    });

    await this.riskAlertRepository.save({
      type: 'RECONCILIATION_ISSUE',
      severity: params.severity,
      user_id: null,
      transaction_id: null,
      description: `${params.issueType} (${params.reportDate}): ${params.description}`,
      risk_score:
        params.severity === 'HIGH'
          ? 90
          : params.severity === 'MEDIUM'
            ? 65
            : 30,
      status: 'OPEN',
    });

    await this.auditService
      .audit({
        action: 'RECONCILIATION_ISSUE_CREATED',
        targetType: 'RECONCILIATION_ISSUE',
        targetId: issue.id,
        metadata: {
          report_date: params.reportDate,
          issue_type: params.issueType,
          severity: params.severity,
        },
      })
      .catch(() => {});

    return issue;
  }

  private getUtcDateWindow(date: Date): {
    start: Date;
    end: Date;
    reportDate: string;
  } {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const start = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, day + 1, 0, 0, 0, 0));
    return {
      start,
      end,
      reportDate: start.toISOString().slice(0, 10),
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
