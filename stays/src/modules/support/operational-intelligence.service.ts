import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DEFAULT_ADMIN_ACTOR,
  assertCanAccessTicket,
  isSupportAgentActor,
  type SupportStaffActor,
} from './support-staff-access';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, MoreThanOrEqual, QueryFailedError, Repository } from 'typeorm';
import { StaysAuditService } from '../stays/services/stays-audit.service';
import {
  computeSupportSla,
  SUPPORT_SLA,
  type SupportSlaState,
} from './support-sla.config';
import {
  StaysSupportTicket,
  SupportTicketStatus,
} from './entities/stays-support-ticket.entity';
import { StaysConversationReport } from './entities/stays-conversation-report.entity';
import { StaysSafetyIssue } from './entities/stays-safety-issue.entity';
import { StaysSupportTicketCsat } from './entities/stays-support-ticket-csat.entity';
import { StaysSupportOperationalSignal } from './entities/stays-support-operational-signal.entity';
import {
  explanationForReason,
  LOW_CSAT_LOW_RATING_MAX,
  LOW_CSAT_LOW_RATING_MIN_COUNT,
  LOW_CSAT_MIN_RESPONSES,
  LOW_CSAT_WINDOW_DAYS,
  MULTIPLE_OPEN_TICKETS_MIN,
  OPERATIONAL_RULE_VERSION,
  OPERATIONAL_SIGNAL_SEVERITIES,
  OPERATIONAL_SIGNAL_STATUSES,
  OPERATIONAL_SIGNAL_TYPES,
  REPEAT_REPORT_MIN_COUNT,
  REPEAT_REPORT_WINDOW_DAYS,
  REPEAT_SAFETY_MIN_COUNT,
  REPEAT_SAFETY_WINDOW_DAYS,
  SEVERE_SAFETY_CATEGORIES,
  signalDedupeKey,
  type OperationalSignalSeverity,
  type OperationalSignalStatus,
  type OperationalSignalSubjectType,
  type OperationalSignalType,
  type SignalReasonCode,
} from './operational-signals.constants';

const OPEN_TICKET_STATUSES: SupportTicketStatus[] = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_CUSTOMER',
  'WAITING_FOR_HOST',
  'ESCALATED',
];

function isUniqueViolation(err: unknown): boolean {
  if (err instanceof QueryFailedError) {
    const driver = err.driverError as { code?: string };
    return driver?.code === '23505';
  }
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === '23505'
  );
}

const RELATED_LIMIT = 10;

export type RelatedTicketRelationship =
  | 'SAME_REPORT'
  | 'SAME_SAFETY_ISSUE'
  | 'SAME_BOOKING'
  | 'SAME_LISTING'
  | 'SAME_REPORTED_USER'
  | 'SAME_REQUESTER';

const RELATIONSHIP_RANK: Record<RelatedTicketRelationship, number> = {
  SAME_REPORT: 1,
  SAME_SAFETY_ISSUE: 1,
  SAME_BOOKING: 2,
  SAME_LISTING: 3,
  SAME_REPORTED_USER: 4,
  SAME_REQUESTER: 5,
};

type DesiredSignal = {
  type: OperationalSignalType;
  severity: OperationalSignalSeverity;
  subjectType: OperationalSignalSubjectType;
  subjectId: string;
  ticketId?: string | null;
  reportId?: string | null;
  safetyIssueId?: string | null;
  metadata: Record<string, unknown> & { code: SignalReasonCode };
};

@Injectable()
export class OperationalIntelligenceService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(StaysSupportOperationalSignal)
    private readonly signalRepo: Repository<StaysSupportOperationalSignal>,
    @InjectRepository(StaysSupportTicket)
    private readonly ticketRepo: Repository<StaysSupportTicket>,
    @InjectRepository(StaysConversationReport)
    private readonly reportRepo: Repository<StaysConversationReport>,
    @InjectRepository(StaysSafetyIssue)
    private readonly safetyRepo: Repository<StaysSafetyIssue>,
    @InjectRepository(StaysSupportTicketCsat)
    private readonly csatRepo: Repository<StaysSupportTicketCsat>,
    private readonly staysAudit: StaysAuditService,
  ) {}

  async safeEvaluate(fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch {
      /* operational signals never fail parent ticket/report operations */
    }
  }

  /** SLA + unassigned only — returned list rows, never a full-table scan. */
  async evaluateListedTickets(
    tickets: StaysSupportTicket[],
    now: Date = new Date(),
  ): Promise<void> {
    if (!tickets.length) return;
    const desired: DesiredSignal[] = [];
    const resolveKeys: string[] = [];
    for (const ticket of tickets) {
      const { upserts, resolves } = this.ticketScopedDesires(ticket, now);
      desired.push(...upserts);
      resolveKeys.push(...resolves);
    }
    await this.applyDesires(desired, resolveKeys);
  }

  async evaluateTicket(
    ticketId: string,
    now: Date = new Date(),
  ): Promise<void> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) return;
    const { upserts, resolves } = this.ticketScopedDesires(ticket, now);
    const multi = await this.evaluateMultipleOpenTicketsDesire(
      ticket.requester_user_id,
    );
    await this.applyDesires(
      [...upserts, ...multi.upserts],
      [...resolves, ...multi.resolves],
    );
  }

  async evaluateReport(kind: 'conversation_reported' | 'safety_issue', id: string) {
    if (kind === 'conversation_reported') {
      const report = await this.reportRepo.findOne({ where: { id } });
      if (!report) return;
      if (report.reported_user_id) {
        await this.evaluateRepeatReports(report.reported_user_id);
      }
      const ticket = await this.ticketRepo.findOne({
        where: { report_id: report.id },
      });
      if (ticket) await this.evaluateTicket(ticket.id);
      return;
    }
    const safety = await this.safetyRepo.findOne({ where: { id } });
    if (!safety) return;
    if (safety.reported_user_id) {
      await this.evaluateRepeatSafety(safety.reported_user_id);
    }
    const ticket = await this.ticketRepo.findOne({
      where: { safety_issue_id: safety.id },
    });
    if (ticket) await this.evaluateTicket(ticket.id);
  }

  async evaluateCsatForAdmin(assignedAdminId: string | null | undefined) {
    if (!assignedAdminId) return;
    await this.evaluateLowCsatPattern(assignedAdminId);
  }

  async evaluateRepeatReports(reportedUserId: string): Promise<void> {
    const since = daysAgo(REPEAT_REPORT_WINDOW_DAYS);
    const reports = await this.reportRepo.find({
      where: {
        reported_user_id: reportedUserId,
        created_at: MoreThanOrEqual(since),
      },
      order: { created_at: 'DESC' },
    });
    const count = reports.length;
    const key = signalDedupeKey('REPEAT_REPORT', 'USER', reportedUserId);
    if (count < REPEAT_REPORT_MIN_COUNT) {
      await this.applyDesires([], [key]);
      return;
    }
    const latest = reports[0];
    const ticket = latest
      ? await this.ticketRepo.findOne({ where: { report_id: latest.id } })
      : null;
    await this.applyDesires(
      [
        {
          type: 'REPEAT_REPORT',
          severity: count >= 5 ? 'HIGH' : 'MEDIUM',
          subjectType: 'USER',
          subjectId: reportedUserId,
          ticketId: ticket?.id ?? null,
          reportId: latest?.id ?? null,
          metadata: {
            code: 'REPEAT_REPORT_THRESHOLD',
            count,
            windowDays: REPEAT_REPORT_WINDOW_DAYS,
          },
        },
      ],
      [],
    );
  }

  async evaluateRepeatSafety(reportedUserId: string): Promise<void> {
    const since = daysAgo(REPEAT_SAFETY_WINDOW_DAYS);
    const issues = await this.safetyRepo.find({
      where: {
        reported_user_id: reportedUserId,
        created_at: MoreThanOrEqual(since),
      },
      order: { created_at: 'DESC' },
    });
    const count = issues.length;
    const key = signalDedupeKey('REPEAT_SAFETY_REPORT', 'USER', reportedUserId);
    if (count < REPEAT_SAFETY_MIN_COUNT) {
      await this.applyDesires([], [key]);
      return;
    }
    const severe = issues.some((row) =>
      (SEVERE_SAFETY_CATEGORIES as readonly string[]).includes(row.category),
    );
    const latest = issues[0];
    const ticket = latest
      ? await this.ticketRepo.findOne({
          where: { safety_issue_id: latest.id },
        })
      : null;
    await this.applyDesires(
      [
        {
          type: 'REPEAT_SAFETY_REPORT',
          severity: severe ? 'URGENT' : 'HIGH',
          subjectType: 'USER',
          subjectId: reportedUserId,
          ticketId: ticket?.id ?? null,
          safetyIssueId: latest?.id ?? null,
          metadata: {
            code: severe
              ? 'REPEAT_SAFETY_SEVERE_CATEGORY'
              : 'REPEAT_SAFETY_THRESHOLD',
            count,
            windowDays: REPEAT_SAFETY_WINDOW_DAYS,
          },
        },
      ],
      [],
    );
  }

  async evaluateLowCsatPattern(assignedAdminId: string): Promise<void> {
    const since = daysAgo(LOW_CSAT_WINDOW_DAYS);
    const tickets = await this.ticketRepo.find({
      where: { assigned_admin_id: assignedAdminId },
      select: ['id'],
    });
    const key = signalDedupeKey('LOW_CSAT_PATTERN', 'ADMIN', assignedAdminId);
    if (!tickets.length) {
      await this.applyDesires([], [key]);
      return;
    }
    const ratings = await this.csatRepo.find({
      where: {
        ticket_id: In(tickets.map((t) => t.id)),
        submitted_at: MoreThanOrEqual(since),
      },
    });
    const total = ratings.length;
    const lowCount = ratings.filter(
      (r) => r.rating <= LOW_CSAT_LOW_RATING_MAX,
    ).length;
    if (
      total < LOW_CSAT_MIN_RESPONSES ||
      lowCount < LOW_CSAT_LOW_RATING_MIN_COUNT
    ) {
      await this.applyDesires([], [key]);
      return;
    }
    await this.applyDesires(
      [
        {
          type: 'LOW_CSAT_PATTERN',
          severity: 'MEDIUM',
          subjectType: 'ADMIN',
          subjectId: assignedAdminId,
          metadata: {
            code: 'LOW_CSAT_PATTERN',
            count: lowCount,
            total,
            windowDays: LOW_CSAT_WINDOW_DAYS,
          },
        },
      ],
      [],
    );
  }

  async listSignals(query: {
    limit?: number;
    offset?: number;
    status?: string;
    severity?: string;
    type?: string;
    ticketId?: string;
    assignedAdminId?: string;
    includeResolved?: boolean;
  }) {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const offset = Math.max(query.offset ?? 0, 0);
    const qb = this.signalRepo.createQueryBuilder('s');
    if (query.status) {
      if (
        !(OPERATIONAL_SIGNAL_STATUSES as readonly string[]).includes(
          query.status,
        )
      ) {
        throw new BadRequestException('Invalid status');
      }
      qb.andWhere('s.status = :status', { status: query.status });
    } else if (!query.includeResolved) {
      qb.andWhere('s.status IN (:...statuses)', {
        statuses: ['ACTIVE', 'ACKNOWLEDGED'],
      });
    }
    if (query.severity) {
      if (
        !(OPERATIONAL_SIGNAL_SEVERITIES as readonly string[]).includes(
          query.severity,
        )
      ) {
        throw new BadRequestException('Invalid severity');
      }
      qb.andWhere('s.severity = :severity', { severity: query.severity });
    }
    if (query.type) {
      if (
        !(OPERATIONAL_SIGNAL_TYPES as readonly string[]).includes(query.type)
      ) {
        throw new BadRequestException('Invalid type');
      }
      qb.andWhere('s.signal_type = :type', { type: query.type });
    }
    if (query.ticketId) {
      qb.andWhere('s.ticket_id = :ticketId', { ticketId: query.ticketId });
    }
    if (query.assignedAdminId) {
      qb.innerJoin(
        StaysSupportTicket,
        't',
        't.id = s.ticket_id AND t.assigned_admin_id = :assignedAdminId',
        { assignedAdminId: query.assignedAdminId },
      );
    }
    const total = await qb.clone().getCount();
    const rows = await qb
      .orderBy('s.last_detected_at', 'DESC')
      .addOrderBy('s.id', 'DESC')
      .skip(offset)
      .take(limit)
      .getMany();
    return {
      items: rows.map((row) => this.toSignalPayload(row)),
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    };
  }

  async listSignalsForTicket(
    ticketId: string,
    includeResolved = false,
    actor: SupportStaffActor = DEFAULT_ADMIN_ACTOR,
  ) {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    assertCanAccessTicket(ticket, actor);
    const statuses: OperationalSignalStatus[] = includeResolved
      ? ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED']
      : ['ACTIVE', 'ACKNOWLEDGED'];
    const rows = await this.signalRepo.find({
      where: { ticket_id: ticketId, status: In(statuses) },
      order: { last_detected_at: 'DESC' },
    });
    return { items: rows.map((row) => this.toSignalPayload(row)) };
  }

  async listSignalsForReportedUser(reportedUserId: string | null | undefined) {
    if (!reportedUserId) return { items: [] };
    const rows = await this.signalRepo.find({
      where: {
        subject_type: 'USER',
        subject_id: reportedUserId,
        status: In(['ACTIVE', 'ACKNOWLEDGED']),
        signal_type: In(['REPEAT_REPORT', 'REPEAT_SAFETY_REPORT']),
      },
      order: { last_detected_at: 'DESC' },
    });
    return { items: rows.map((row) => this.toSignalPayload(row)) };
  }

  async activeTypesByTicketIds(ticketIds: string[]) {
    const map = new Map<string, string[]>();
    if (!ticketIds.length) return map;
    const rows = await this.signalRepo.find({
      where: {
        ticket_id: In(ticketIds),
        status: In(['ACTIVE', 'ACKNOWLEDGED']),
      },
      select: ['ticket_id', 'signal_type'],
    });
    for (const row of rows) {
      if (!row.ticket_id) continue;
      const list = map.get(row.ticket_id) ?? [];
      if (!list.includes(row.signal_type)) list.push(row.signal_type);
      map.set(row.ticket_id, list);
    }
    return map;
  }

  async patchSignal(
    signalId: string,
    nextStatus: OperationalSignalStatus,
    adminUserId: string,
    actor: SupportStaffActor = {
      userId: adminUserId,
      role: 'ADMIN',
    },
  ) {
    if (nextStatus !== 'ACKNOWLEDGED' && nextStatus !== 'RESOLVED') {
      throw new BadRequestException('Invalid status');
    }
    const row = await this.signalRepo.findOne({ where: { id: signalId } });
    if (!row) throw new NotFoundException('Signal not found');
    if (isSupportAgentActor(actor)) {
      if (!row.ticket_id) {
        throw new NotFoundException('Signal not found');
      }
      const ticket = await this.ticketRepo.findOne({
        where: { id: row.ticket_id },
      });
      try {
        assertCanAccessTicket(ticket, actor);
      } catch {
        throw new NotFoundException('Signal not found');
      }
    }
    const from = row.status;
    const allowed =
      (from === 'ACTIVE' &&
        (nextStatus === 'ACKNOWLEDGED' || nextStatus === 'RESOLVED')) ||
      (from === 'ACKNOWLEDGED' && nextStatus === 'RESOLVED');
    if (!allowed) {
      throw new BadRequestException(
        `Cannot transition signal from ${from} to ${nextStatus}`,
      );
    }
    const now = new Date();
    row.status = nextStatus;
    if (nextStatus === 'ACKNOWLEDGED') {
      row.acknowledged_at = now;
      row.acknowledged_by_admin_id = adminUserId;
    } else {
      row.resolved_at = now;
      row.resolved_by_admin_id = adminUserId;
    }
    const saved = await this.signalRepo.save(row);
    await this.staysAudit.log({
      actorUserId: adminUserId,
      actorRole: 'ADMIN',
      entityType: 'support_operational_signal',
      entityId: saved.id,
      action:
        nextStatus === 'ACKNOWLEDGED'
          ? 'support_operational_signal_acknowledged'
          : 'support_operational_signal_resolved',
      metadata: {
        signalId: saved.id,
        ticketId: saved.ticket_id,
        signalType: saved.signal_type,
        fromStatus: from,
        toStatus: nextStatus,
      },
    });
    return this.toSignalPayload(saved);
  }

  async findRelatedTickets(
    ticketId: string,
    actor: SupportStaffActor = DEFAULT_ADMIN_ACTOR,
  ) {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    assertCanAccessTicket(ticket, actor);

    const best = new Map<
      string,
      {
        ticket: StaysSupportTicket;
        relationship: RelatedTicketRelationship;
      }
    >();

    const consider = (
      rows: StaysSupportTicket[],
      relationship: RelatedTicketRelationship,
    ) => {
      for (const row of rows) {
        if (row.id === ticket.id) continue;
        const prev = best.get(row.id);
        if (
          !prev ||
          RELATIONSHIP_RANK[relationship] < RELATIONSHIP_RANK[prev.relationship]
        ) {
          best.set(row.id, { ticket: row, relationship });
        }
      }
    };

    if (ticket.report_id) {
      consider(
        await this.ticketRepo.find({ where: { report_id: ticket.report_id } }),
        'SAME_REPORT',
      );
    }
    if (ticket.safety_issue_id) {
      consider(
        await this.ticketRepo.find({
          where: { safety_issue_id: ticket.safety_issue_id },
        }),
        'SAME_SAFETY_ISSUE',
      );
    }
    if (ticket.booking_id) {
      consider(
        await this.ticketRepo.find({ where: { booking_id: ticket.booking_id } }),
        'SAME_BOOKING',
      );
    }
    if (ticket.listing_id) {
      consider(
        await this.ticketRepo.find({ where: { listing_id: ticket.listing_id } }),
        'SAME_LISTING',
      );
    }

    const reportedIds = new Set<string>();
    if (ticket.report_id) {
      const report = await this.reportRepo.findOne({
        where: { id: ticket.report_id },
      });
      if (report?.reported_user_id) reportedIds.add(report.reported_user_id);
    }
    if (ticket.safety_issue_id) {
      const safety = await this.safetyRepo.findOne({
        where: { id: ticket.safety_issue_id },
      });
      if (safety?.reported_user_id) reportedIds.add(safety.reported_user_id);
    }
    if (reportedIds.size) {
      const reports = await this.reportRepo.find({
        where: { reported_user_id: In([...reportedIds]) },
        select: ['id'],
      });
      const safety = await this.safetyRepo.find({
        where: { reported_user_id: In([...reportedIds]) },
        select: ['id'],
      });
      const reportTickets = reports.length
        ? await this.ticketRepo.find({
            where: { report_id: In(reports.map((r) => r.id)) },
          })
        : [];
      const safetyTickets = safety.length
        ? await this.ticketRepo.find({
            where: { safety_issue_id: In(safety.map((s) => s.id)) },
          })
        : [];
      consider([...reportTickets, ...safetyTickets], 'SAME_REPORTED_USER');
    }

    consider(
      await this.ticketRepo.find({
        where: { requester_user_id: ticket.requester_user_id },
      }),
      'SAME_REQUESTER',
    );

    return [...best.values()]
      .filter(({ ticket: sibling }) => {
        if (!isSupportAgentActor(actor)) return true;
        try {
          assertCanAccessTicket(sibling, actor);
          return true;
        } catch {
          return false;
        }
      })
      .sort(
        (a, b) =>
          RELATIONSHIP_RANK[a.relationship] - RELATIONSHIP_RANK[b.relationship],
      )
      .slice(0, RELATED_LIMIT)
      .map(({ ticket: row, relationship }) => ({
        id: row.id,
        ticketNumber: row.ticket_number,
        status: row.status,
        priority: row.priority,
        relationship,
      }));
  }

  async getOperationsOverview(now: Date = new Date()) {
    const sla = this.liveSlaStateSql('t', 1, 2, 3, 4, 5, 6, 7, 8, 9);
    const slaParams = [
      SUPPORT_SLA.LOW.firstResponseHours,
      SUPPORT_SLA.NORMAL.firstResponseHours,
      SUPPORT_SLA.HIGH.firstResponseHours,
      SUPPORT_SLA.URGENT.firstResponseHours,
      SUPPORT_SLA.LOW.resolutionHours,
      SUPPORT_SLA.NORMAL.resolutionHours,
      SUPPORT_SLA.HIGH.resolutionHours,
      SUPPORT_SLA.URGENT.resolutionHours,
      now.toISOString(),
    ];
    const [counts] = await this.dataSource.query(
      `
      SELECT
        COUNT(*) FILTER (
          WHERE t.status IN ('OPEN','IN_PROGRESS','WAITING_FOR_CUSTOMER','WAITING_FOR_HOST','ESCALATED')
        )::int AS active_tickets,
        COUNT(*) FILTER (
          WHERE t.status IN ('OPEN','IN_PROGRESS','WAITING_FOR_CUSTOMER','WAITING_FOR_HOST','ESCALATED')
            AND t.assigned_admin_id IS NULL
        )::int AS unassigned_tickets,
        COUNT(*) FILTER (
          WHERE t.status IN ('OPEN','IN_PROGRESS','WAITING_FOR_CUSTOMER','WAITING_FOR_HOST','ESCALATED')
            AND t.assigned_admin_id IS NULL
            AND t.priority IN ('HIGH','URGENT')
        )::int AS high_priority_unassigned,
        COUNT(*) FILTER (
          WHERE t.status IN ('OPEN','IN_PROGRESS','WAITING_FOR_CUSTOMER','WAITING_FOR_HOST','ESCALATED')
            AND t.priority = 'URGENT'
        )::int AS urgent_tickets,
        COUNT(*) FILTER (
          WHERE t.status = 'OPEN'
        )::int AS open_tickets,
        COUNT(*) FILTER (
          WHERE t.status = 'IN_PROGRESS'
        )::int AS in_progress_tickets,
        COUNT(*) FILTER (
          WHERE t.status IN ('WAITING_FOR_CUSTOMER','WAITING_FOR_HOST')
        )::int AS waiting_tickets,
        COUNT(*) FILTER (
          WHERE t.status = 'ESCALATED'
        )::int AS escalated_tickets,
        COUNT(*) FILTER (
          WHERE t.status IN ('OPEN','IN_PROGRESS','WAITING_FOR_CUSTOMER','WAITING_FOR_HOST','ESCALATED')
            AND t.priority IN ('HIGH','URGENT')
        )::int AS high_priority_tickets,
        COUNT(*) FILTER (
          WHERE t.status IN ('OPEN','IN_PROGRESS','WAITING_FOR_CUSTOMER','WAITING_FOR_HOST','ESCALATED')
            AND ${sla.combined} = 'ON_TRACK'
        )::int AS sla_on_track,
        COUNT(*) FILTER (
          WHERE t.status IN ('OPEN','IN_PROGRESS','WAITING_FOR_CUSTOMER','WAITING_FOR_HOST','ESCALATED')
            AND ${sla.combined} = 'AT_RISK'
        )::int AS sla_at_risk,
        COUNT(*) FILTER (
          WHERE t.status IN ('OPEN','IN_PROGRESS','WAITING_FOR_CUSTOMER','WAITING_FOR_HOST','ESCALATED')
            AND ${sla.combined} = 'BREACHED'
        )::int AS sla_breached
      FROM stays_support_tickets t
      `,
      slaParams,
    );
    const [signalCounts] = await this.dataSource.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_signals,
        COUNT(*) FILTER (WHERE status = 'ACKNOWLEDGED')::int AS acknowledged_signals
      FROM stays_support_operational_signals
      `,
    );
    const workload = await this.queryAssignedAgentWorkload(now);
    return {
      activeTickets: Number(counts?.active_tickets ?? 0),
      openTickets: Number(counts?.open_tickets ?? 0),
      inProgressTickets: Number(counts?.in_progress_tickets ?? 0),
      waitingTickets: Number(counts?.waiting_tickets ?? 0),
      escalatedTickets: Number(counts?.escalated_tickets ?? 0),
      unassignedTickets: Number(counts?.unassigned_tickets ?? 0),
      highPriorityTickets: Number(counts?.high_priority_tickets ?? 0),
      highPriorityUnassigned: Number(counts?.high_priority_unassigned ?? 0),
      urgentTickets: Number(counts?.urgent_tickets ?? 0),
      slaOnTrack: Number(counts?.sla_on_track ?? 0),
      slaAtRisk: Number(counts?.sla_at_risk ?? 0),
      slaBreached: Number(counts?.sla_breached ?? 0),
      activeSignals: Number(signalCounts?.active_signals ?? 0),
      acknowledgedSignals: Number(signalCounts?.acknowledged_signals ?? 0),
      generatedAt: now.toISOString(),
      agentWorkload: workload.map((row) => ({
        adminId: row.agentId,
        openTickets: row.assigned,
        highPriorityTickets: row.highPriority,
        waitingTickets: row.waiting,
      })),
    };
  }

  async listAttention(
    query: { limit?: number; offset?: number } = {},
    now: Date = new Date(),
  ) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const offset = Math.max(query.offset ?? 0, 0);
    const sla = this.liveSlaStateSql('t', 1, 2, 3, 4, 5, 6, 7, 8, 9);
    const slaParams = [
      SUPPORT_SLA.LOW.firstResponseHours,
      SUPPORT_SLA.NORMAL.firstResponseHours,
      SUPPORT_SLA.HIGH.firstResponseHours,
      SUPPORT_SLA.URGENT.firstResponseHours,
      SUPPORT_SLA.LOW.resolutionHours,
      SUPPORT_SLA.NORMAL.resolutionHours,
      SUPPORT_SLA.HIGH.resolutionHours,
      SUPPORT_SLA.URGENT.resolutionHours,
      now.toISOString(),
    ];
    const activeSql = `t.status IN ('OPEN','IN_PROGRESS','WAITING_FOR_CUSTOMER','WAITING_FOR_HOST','ESCALATED')`;
    const hasSignalSql = `EXISTS (
      SELECT 1 FROM stays_support_operational_signals s
      WHERE s.ticket_id = t.id AND s.status = 'ACTIVE'
    )`;
    const qualify = `
      ${activeSql}
      AND (
        t.assigned_admin_id IS NULL
        OR t.priority IN ('HIGH','URGENT')
        OR ${sla.combined} IN ('AT_RISK','BREACHED')
        OR ${hasSignalSql}
      )
    `;
    const [countRow] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM stays_support_tickets t WHERE ${qualify}`,
      slaParams,
    );
    const rows = await this.dataSource.query(
      `
      SELECT
        t.id,
        t.ticket_number,
        t.subject,
        t.status,
        t.priority,
        t.assigned_admin_id,
        t.created_at,
        ${sla.combined} AS sla_state,
        ${hasSignalSql} AS has_active_signal
      FROM stays_support_tickets t
      WHERE ${qualify}
      ORDER BY
        CASE WHEN ${sla.combined} = 'BREACHED' THEN 0 ELSE 1 END,
        CASE WHEN ${sla.combined} = 'AT_RISK' THEN 0 ELSE 1 END,
        CASE WHEN t.priority = 'URGENT' THEN 0 ELSE 1 END,
        CASE WHEN t.priority = 'HIGH' THEN 0 ELSE 1 END,
        CASE WHEN t.assigned_admin_id IS NULL THEN 0 ELSE 1 END,
        t.created_at ASC,
        t.id ASC
      LIMIT $10 OFFSET $11
      `,
      [...slaParams, limit, offset],
    );
    const total = Number(countRow?.total ?? 0);
    const items = (
      rows as {
        id: string;
        ticket_number: string;
        subject: string;
        status: string;
        priority: string;
        assigned_admin_id: string | null;
        created_at: Date | string;
        sla_state: string;
        has_active_signal: boolean | number | string;
      }[]
    ).map((row) => ({
      ticketId: row.id,
      ticketNumber: row.ticket_number,
      subject: row.subject,
      status: row.status,
      priority: row.priority,
      assignedAdminId: row.assigned_admin_id,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      attentionReasons: attentionReasonsFor(row),
    }));
    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async listAgentWorkload(now: Date = new Date()) {
    const rows = await this.queryAssignedAgentWorkload(now);
    return {
      items: rows.map((row) => ({
        agentId: row.agentId,
        assigned: row.assigned,
        open: row.open,
        inProgress: row.inProgress,
        waiting: row.waiting,
        atRisk: row.atRisk,
        breached: row.breached,
        oldestActiveTicketAt: row.oldestActiveTicketAt,
      })),
      generatedAt: now.toISOString(),
    };
  }

  private async queryAssignedAgentWorkload(now: Date = new Date()): Promise<
    {
      agentId: string;
      assigned: number;
      open: number;
      inProgress: number;
      waiting: number;
      highPriority: number;
      atRisk: number;
      breached: number;
      oldestActiveTicketAt: string | null;
    }[]
  > {
    const sla = this.liveSlaStateSql('t', 1, 2, 3, 4, 5, 6, 7, 8, 9);
    const slaParams = [
      SUPPORT_SLA.LOW.firstResponseHours,
      SUPPORT_SLA.NORMAL.firstResponseHours,
      SUPPORT_SLA.HIGH.firstResponseHours,
      SUPPORT_SLA.URGENT.firstResponseHours,
      SUPPORT_SLA.LOW.resolutionHours,
      SUPPORT_SLA.NORMAL.resolutionHours,
      SUPPORT_SLA.HIGH.resolutionHours,
      SUPPORT_SLA.URGENT.resolutionHours,
      now.toISOString(),
    ];
    const workload = await this.dataSource.query(
      `
      SELECT
        t.assigned_admin_id AS agent_id,
        COUNT(*)::int AS assigned,
        COUNT(*) FILTER (WHERE t.status = 'OPEN')::int AS open,
        COUNT(*) FILTER (WHERE t.status = 'IN_PROGRESS')::int AS in_progress,
        COUNT(*) FILTER (
          WHERE t.status IN ('WAITING_FOR_CUSTOMER','WAITING_FOR_HOST')
        )::int AS waiting,
        COUNT(*) FILTER (WHERE t.priority IN ('HIGH','URGENT'))::int AS high_priority,
        COUNT(*) FILTER (WHERE ${sla.combined} = 'AT_RISK')::int AS at_risk,
        COUNT(*) FILTER (WHERE ${sla.combined} = 'BREACHED')::int AS breached,
        MIN(t.created_at) AS oldest_active_ticket_at
      FROM stays_support_tickets t
      WHERE t.assigned_admin_id IS NOT NULL
        AND t.status IN ('OPEN','IN_PROGRESS','WAITING_FOR_CUSTOMER','WAITING_FOR_HOST','ESCALATED')
      GROUP BY t.assigned_admin_id
      ORDER BY assigned DESC, t.assigned_admin_id ASC
      `,
      slaParams,
    );
    return (
      workload as {
        agent_id: string;
        assigned: number;
        open: number;
        in_progress: number;
        waiting: number;
        high_priority: number;
        at_risk: number;
        breached: number;
        oldest_active_ticket_at: Date | string | null;
      }[]
    ).map((row) => ({
      agentId: row.agent_id,
      assigned: Number(row.assigned),
      open: Number(row.open),
      inProgress: Number(row.in_progress),
      waiting: Number(row.waiting),
      highPriority: Number(row.high_priority),
      atRisk: Number(row.at_risk ?? 0),
      breached: Number(row.breached ?? 0),
      oldestActiveTicketAt: row.oldest_active_ticket_at
        ? new Date(row.oldest_active_ticket_at).toISOString()
        : null,
    }));
  }

  applySlaStateFilter(
    qb: {
      andWhere: (sql: string, params?: Record<string, unknown>) => unknown;
    },
    alias: string,
    slaState: 'AT_RISK' | 'BREACHED',
  ) {
    const sla = this.liveSlaStateSqlNamed(alias);
    qb.andWhere(`${sla.combined} = :slaState`, {
      slaFrLow: SUPPORT_SLA.LOW.firstResponseHours,
      slaFrNormal: SUPPORT_SLA.NORMAL.firstResponseHours,
      slaFrHigh: SUPPORT_SLA.HIGH.firstResponseHours,
      slaFrUrgent: SUPPORT_SLA.URGENT.firstResponseHours,
      slaResLow: SUPPORT_SLA.LOW.resolutionHours,
      slaResNormal: SUPPORT_SLA.NORMAL.resolutionHours,
      slaResHigh: SUPPORT_SLA.HIGH.resolutionHours,
      slaResUrgent: SUPPORT_SLA.URGENT.resolutionHours,
      slaNow: new Date().toISOString(),
      slaState,
    });
  }

  toSignalPayload(row: StaysSupportOperationalSignal) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown> & {
      code?: SignalReasonCode;
    };
    const code = (metadata.code ?? 'REPEAT_REPORT_THRESHOLD') as SignalReasonCode;
    return {
      id: row.id,
      type: row.signal_type,
      severity: row.severity,
      status: row.status,
      subjectType: row.subject_type,
      subjectId: row.subject_id,
      ticketId: row.ticket_id,
      reportId: row.report_id,
      safetyIssueId: row.safety_issue_id,
      reason: {
        code,
        explanation: explanationForReason(code, metadata),
      },
      firstDetectedAt: row.first_detected_at.toISOString(),
      lastDetectedAt: row.last_detected_at.toISOString(),
      acknowledgedAt: row.acknowledged_at?.toISOString() ?? null,
      resolvedAt: row.resolved_at?.toISOString() ?? null,
    };
  }

  private async evaluateMultipleOpenTicketsDesire(requesterUserId: string) {
    const count = await this.ticketRepo.count({
      where: {
        requester_user_id: requesterUserId,
        status: In(OPEN_TICKET_STATUSES),
      },
    });
    const key = signalDedupeKey(
      'MULTIPLE_OPEN_TICKETS',
      'USER',
      requesterUserId,
    );
    if (count < MULTIPLE_OPEN_TICKETS_MIN) {
      return { upserts: [] as DesiredSignal[], resolves: [key] };
    }
    const latest = await this.ticketRepo.findOne({
      where: {
        requester_user_id: requesterUserId,
        status: In(OPEN_TICKET_STATUSES),
      },
      order: { updated_at: 'DESC' },
    });
    return {
      upserts: [
        {
          type: 'MULTIPLE_OPEN_TICKETS' as const,
          severity: (count >= 4 ? 'MEDIUM' : 'LOW') as OperationalSignalSeverity,
          subjectType: 'USER' as const,
          subjectId: requesterUserId,
          ticketId: latest?.id ?? null,
          metadata: {
            code: 'MULTIPLE_OPEN_TICKETS' as const,
            count,
          },
        },
      ],
      resolves: [] as string[],
    };
  }

  private ticketScopedDesires(
    ticket: StaysSupportTicket,
    now: Date,
  ): { upserts: DesiredSignal[]; resolves: string[] } {
    const upserts: DesiredSignal[] = [];
    const resolves: string[] = [];
    const sla = computeSupportSla(
      {
        createdAt: ticket.created_at,
        priority: ticket.priority,
        firstAdminResponseAt: ticket.first_admin_response_at,
        resolvedAt: ticket.resolved_at,
      },
      now,
    );
    const attentionKey = signalDedupeKey('SLA_ATTENTION', 'TICKET', ticket.id);
    const breachedKey = signalDedupeKey('SLA_BREACHED', 'TICKET', ticket.id);
    const unassignedKey = signalDedupeKey(
      'UNASSIGNED_HIGH_PRIORITY',
      'TICKET',
      ticket.id,
    );

    const atRisk = this.pickSlaReason(sla, 'AT_RISK');
    const breached = this.pickSlaReason(sla, 'BREACHED');
    if (atRisk) {
      upserts.push({
        type: 'SLA_ATTENTION',
        severity: 'HIGH',
        subjectType: 'TICKET',
        subjectId: ticket.id,
        ticketId: ticket.id,
        metadata: { code: atRisk },
      });
    } else {
      resolves.push(attentionKey);
    }
    if (breached) {
      upserts.push({
        type: 'SLA_BREACHED',
        severity: 'URGENT',
        subjectType: 'TICKET',
        subjectId: ticket.id,
        ticketId: ticket.id,
        metadata: { code: breached },
      });
    } else {
      resolves.push(breachedKey);
    }

    const open = OPEN_TICKET_STATUSES.includes(ticket.status);
    const high = ticket.priority === 'HIGH' || ticket.priority === 'URGENT';
    if (open && high && !ticket.assigned_admin_id) {
      upserts.push({
        type: 'UNASSIGNED_HIGH_PRIORITY',
        severity: ticket.priority as OperationalSignalSeverity,
        subjectType: 'TICKET',
        subjectId: ticket.id,
        ticketId: ticket.id,
        metadata: { code: 'UNASSIGNED_HIGH_PRIORITY' },
      });
    } else {
      resolves.push(unassignedKey);
    }

    return { upserts, resolves };
  }

  private pickSlaReason(
    sla: ReturnType<typeof computeSupportSla>,
    state: SupportSlaState,
  ): SignalReasonCode | null {
    if (state === 'AT_RISK') {
      if (sla.firstResponse.state === 'AT_RISK') return 'FIRST_RESPONSE_AT_RISK';
      if (sla.resolution.state === 'AT_RISK') return 'FIRST_RESOLUTION_AT_RISK';
      return null;
    }
    if (sla.firstResponse.state === 'BREACHED') return 'FIRST_RESPONSE_BREACHED';
    if (sla.resolution.state === 'BREACHED') return 'FIRST_RESOLUTION_BREACHED';
    return null;
  }

  /**
   * For every evaluated rule: upsert/reactivate if true, else resolve the
   * existing ACTIVE/ACKNOWLEDGED row for that exact dedupe_key.
   */
  private async applyDesires(
    upserts: DesiredSignal[],
    resolveKeys: string[],
    retried = false,
  ): Promise<void> {
    const keys = [
      ...upserts.map((d) =>
        signalDedupeKey(d.type, d.subjectType, d.subjectId),
      ),
      ...resolveKeys,
    ];
    if (!keys.length) return;
    const existing = await this.signalRepo.find({
      where: { dedupe_key: In(keys) },
    });
    const byKey = new Map(existing.map((row) => [row.dedupe_key, row]));
    const now = new Date();
    const toSave: StaysSupportOperationalSignal[] = [];

    for (const desire of upserts) {
      const dedupeKey = signalDedupeKey(
        desire.type,
        desire.subjectType,
        desire.subjectId,
      );
      const row = byKey.get(dedupeKey);
      if (!row) {
        toSave.push(
          this.signalRepo.create({
            ticket_id: desire.ticketId ?? null,
            report_id: desire.reportId ?? null,
            safety_issue_id: desire.safetyIssueId ?? null,
            signal_type: desire.type,
            severity: desire.severity,
            status: 'ACTIVE',
            subject_type: desire.subjectType,
            subject_id: desire.subjectId,
            rule_version: OPERATIONAL_RULE_VERSION,
            dedupe_key: dedupeKey,
            metadata: desire.metadata,
            first_detected_at: now,
            last_detected_at: now,
            acknowledged_at: null,
            acknowledged_by_admin_id: null,
            resolved_at: null,
            resolved_by_admin_id: null,
          }),
        );
        continue;
      }
      row.severity = desire.severity;
      row.metadata = desire.metadata;
      row.last_detected_at = now;
      row.ticket_id = desire.ticketId ?? row.ticket_id;
      row.report_id = desire.reportId ?? row.report_id;
      row.safety_issue_id = desire.safetyIssueId ?? row.safety_issue_id;
      if (row.status === 'RESOLVED') {
        row.status = 'ACTIVE';
        row.acknowledged_at = null;
        row.acknowledged_by_admin_id = null;
        row.resolved_at = null;
        row.resolved_by_admin_id = null;
      }
      toSave.push(row);
    }

    for (const key of resolveKeys) {
      const row = byKey.get(key);
      if (!row) continue;
      if (row.status === 'RESOLVED') continue;
      row.status = 'RESOLVED';
      row.resolved_at = now;
      row.resolved_by_admin_id = null;
      toSave.push(row);
    }

    if (toSave.length) {
      try {
        await this.signalRepo.save(toSave);
      } catch (err) {
        if (!isUniqueViolation(err) || retried) throw err;
        // Concurrent insert lost UNIQUE(dedupe_key). Reload and apply as updates.
        await this.applyDesires(upserts, resolveKeys, true);
      }
    }
  }

  private liveSlaStateSql(
    alias: string,
    frLow: number,
    frNormal: number,
    frHigh: number,
    frUrgent: number,
    resLow: number,
    resNormal: number,
    resHigh: number,
    resUrgent: number,
    now: number,
  ) {
    const frHours = `
      CASE ${alias}.priority
        WHEN 'LOW' THEN $${frLow}::int
        WHEN 'HIGH' THEN $${frHigh}::int
        WHEN 'URGENT' THEN $${frUrgent}::int
        ELSE $${frNormal}::int
      END
    `;
    const resHours = `
      CASE ${alias}.priority
        WHEN 'LOW' THEN $${resLow}::int
        WHEN 'HIGH' THEN $${resHigh}::int
        WHEN 'URGENT' THEN $${resUrgent}::int
        ELSE $${resNormal}::int
      END
    `;
    const fr = slaLegSql(
      alias,
      `${alias}.first_admin_response_at`,
      frHours,
      `$${now}::timestamptz`,
    );
    const res = slaLegSql(
      alias,
      `${alias}.resolved_at`,
      resHours,
      `$${now}::timestamptz`,
    );
    return {
      combined: `CASE
        WHEN ${fr} = 'BREACHED' OR ${res} = 'BREACHED' THEN 'BREACHED'
        WHEN ${fr} = 'AT_RISK' OR ${res} = 'AT_RISK' THEN 'AT_RISK'
        ELSE 'ON_TRACK'
      END`,
    };
  }

  private liveSlaStateSqlNamed(alias: string) {
    const frHours = `
      CASE ${alias}.priority
        WHEN 'LOW' THEN CAST(:slaFrLow AS int)
        WHEN 'HIGH' THEN CAST(:slaFrHigh AS int)
        WHEN 'URGENT' THEN CAST(:slaFrUrgent AS int)
        ELSE CAST(:slaFrNormal AS int)
      END
    `;
    const resHours = `
      CASE ${alias}.priority
        WHEN 'LOW' THEN CAST(:slaResLow AS int)
        WHEN 'HIGH' THEN CAST(:slaResHigh AS int)
        WHEN 'URGENT' THEN CAST(:slaResUrgent AS int)
        ELSE CAST(:slaResNormal AS int)
      END
    `;
    const fr = slaLegSql(
      alias,
      `${alias}.first_admin_response_at`,
      frHours,
      `CAST(:slaNow AS timestamptz)`,
    );
    const res = slaLegSql(
      alias,
      `${alias}.resolved_at`,
      resHours,
      `CAST(:slaNow AS timestamptz)`,
    );
    return {
      combined: `CASE
        WHEN ${fr} = 'BREACHED' OR ${res} = 'BREACHED' THEN 'BREACHED'
        WHEN ${fr} = 'AT_RISK' OR ${res} = 'AT_RISK' THEN 'AT_RISK'
        ELSE 'ON_TRACK'
      END`,
    };
  }
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function attentionReasonsFor(row: {
  sla_state: string;
  priority: string;
  assigned_admin_id: string | null;
  has_active_signal: boolean | number | string;
}): string[] {
  const reasons: string[] = [];
  if (row.sla_state === 'BREACHED') reasons.push('SLA_BREACHED');
  if (row.sla_state === 'AT_RISK') reasons.push('SLA_AT_RISK');
  if (row.priority === 'URGENT') reasons.push('URGENT');
  else if (row.priority === 'HIGH') reasons.push('HIGH_PRIORITY');
  if (!row.assigned_admin_id) reasons.push('UNASSIGNED');
  const hasSignal =
    row.has_active_signal === true ||
    row.has_active_signal === 1 ||
    row.has_active_signal === 't' ||
    row.has_active_signal === 'true';
  if (hasSignal) reasons.push('ACTIVE_SIGNAL');
  return reasons;
}

function slaLegSql(
  alias: string,
  completedCol: string,
  hoursExpr: string,
  nowExpr: string,
): string {
  return `CASE
    WHEN ${completedCol} IS NOT NULL THEN
      CASE
        WHEN ${completedCol} <= ${alias}.created_at + ((${hoursExpr}) * INTERVAL '1 hour')
          THEN 'ON_TRACK'
        ELSE 'BREACHED'
      END
    ELSE
      CASE
        WHEN EXTRACT(EPOCH FROM (${nowExpr} - ${alias}.created_at))
          < 0.8 * (${hoursExpr}) * 3600 THEN 'ON_TRACK'
        WHEN EXTRACT(EPOCH FROM (${nowExpr} - ${alias}.created_at))
          < (${hoursExpr}) * 3600 THEN 'AT_RISK'
        ELSE 'BREACHED'
      END
  END`;
}
