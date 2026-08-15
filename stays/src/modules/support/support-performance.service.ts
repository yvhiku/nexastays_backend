import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OperationalIntelligenceService } from './operational-intelligence.service';
import { SUPPORT_SLA } from './support-sla.config';
import { maxActiveTicketsPerAgent } from './support-routing.config';
import {
  daysForPerformanceRange,
  supportMinReviewsForQualitySignal,
  supportReopenMaturityDays,
  type SupportPerformanceRange,
} from './support-quality.config';

const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000;
const SAMPLE_MIN = 5;

const FIRST_RESPONDER_LATERAL = `
  JOIN LATERAL (
    SELECT m.sender_id
    FROM stays_messages m
    WHERE m.conversation_id = t.conversation_id
      AND m.sender_id IS NOT NULL
      AND m.sender_id <> t.requester_user_id
      AND m.is_system = false
    ORDER BY m.sent_at ASC NULLS LAST, m.conversation_sequence ASC
    LIMIT 1
  ) first_sender ON true
`;

function frHoursSql(alias: string, pLow: number, pNormal: number, pHigh: number, pUrgent: number) {
  return `CASE ${alias}.priority
    WHEN 'LOW' THEN $${pLow}::int
    WHEN 'HIGH' THEN $${pHigh}::int
    WHEN 'URGENT' THEN $${pUrgent}::int
    ELSE $${pNormal}::int
  END`;
}

function resHoursSql(alias: string, pLow: number, pNormal: number, pHigh: number, pUrgent: number) {
  return `CASE ${alias}.priority
    WHEN 'LOW' THEN $${pLow}::int
    WHEN 'HIGH' THEN $${pHigh}::int
    WHEN 'URGENT' THEN $${pUrgent}::int
    ELSE $${pNormal}::int
  END`;
}

export type AgentRatingDistribution = {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
};

export type AgentPerformanceMetrics = {
  reviewCount: number;
  averageAgentRating: number | null;
  averageOverallRating: number | null;
  agentRatingDistribution: AgentRatingDistribution;
  problemSolvedCount: number;
  problemNotSolvedCount: number;
  problemSolvedRate: number | null;
  ticketsClosed: number;
  ticketsReopened: number;
  reopenRate: number | null;
  maturedTicketsClosed: number;
  maturedTicketsReopened: number;
  maturedReopenRate: number | null;
  firstResponseCount: number;
  firstResponseSlaMet: number;
  firstResponseSlaBreached: number;
  firstResponseSlaRate: number | null;
  averageFirstResponseSeconds: number | null;
  resolutionCount: number;
  resolutionSlaMet: number;
  resolutionSlaBreached: number;
  resolutionSlaRate: number | null;
  averageResolutionSeconds: number | null;
  assignedCount: number;
  followUpRequiredCount: number;
};

export type AgentPerformanceRow = AgentPerformanceMetrics & {
  agentId: string;
  activeCount: number;
  inProgress: number;
  waitingForCustomer: number;
  waitingForHost: number;
  escalated: number;
  workloadCap: number;
};

export type CategoryPerformanceRow = {
  category: string;
  ticketVolume: number;
  reviewCount: number;
  averageOverallRating: number | null;
  averageAgentRating: number | null;
  problemSolvedRate: number | null;
  ticketsReopened: number;
  ticketsClosed: number;
  firstResponseSlaRate: number | null;
  resolutionSlaRate: number | null;
};

export type LanguagePerformanceRow = {
  language: string;
  ticketVolume: number;
  reviewCount: number;
  averageOverallRating: number | null;
  problemSolvedRate: number | null;
  firstResponseSlaRate: number | null;
  resolutionSlaRate: number | null;
};

export type CannedEffectivenessRow = {
  replyId: string;
  title: string | null;
  usageCount: number;
  reviewedCount: number;
  problemSolvedRate: number | null;
  averageOverallRating: number | null;
};

export type AgentFeedbackItem = {
  ticketId: string;
  category: string;
  agentRating: number | null;
  problemSolved: boolean | null;
  comment: string | null;
  submittedAt: string;
};

export type PerformanceWindow = {
  from: Date;
  toExclusive: Date;
  range: SupportPerformanceRange;
};

@Injectable()
export class SupportPerformanceService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ops: OperationalIntelligenceService,
  ) {}

  parseWindow(input: {
    range?: string;
    from?: string;
    to?: string;
  } = {}): PerformanceWindow {
    const range = this.normalizeRange(input.range);
    const now = new Date();
    if (input.from || input.to) {
      const from = input.from
        ? new Date(input.from)
        : new Date(now.getTime() - daysForPerformanceRange(range) * 86400000);
      const toExclusive = input.to ? new Date(input.to) : new Date(now.getTime() + 1);
      this.assertWindow(from, toExclusive);
      return { from, toExclusive, range };
    }
    const from = new Date(
      now.getTime() - daysForPerformanceRange(range) * 86400000,
    );
    return { from, toExclusive: new Date(now.getTime() + 1), range };
  }

  private normalizeRange(raw?: string): SupportPerformanceRange {
    if (raw === '7d' || raw === '90d' || raw === '30d') return raw;
    if (raw) throw new BadRequestException('range must be 7d, 30d, or 90d');
    return '30d';
  }

  private assertWindow(from: Date, toExclusive: Date) {
    if (Number.isNaN(from.getTime()) || Number.isNaN(toExclusive.getTime())) {
      throw new BadRequestException('Invalid from/to date');
    }
    if (from >= toExclusive) {
      throw new BadRequestException('from must be before to');
    }
    if (toExclusive.getTime() - from.getTime() > MAX_RANGE_MS) {
      throw new BadRequestException('Date range must be 90 days or less');
    }
  }

  freshnessLive(window: PerformanceWindow) {
    return {
      range: window.range,
      from: window.from.toISOString(),
      to: window.toExclusive.toISOString(),
      generatedAt: new Date().toISOString(),
      dataFreshness: 'LIVE' as const,
    };
  }

  async listAgentPerformance(
    window: PerformanceWindow,
  ): Promise<AgentPerformanceRow[]> {
    const live = await this.ops.queryAssignedAgentWorkload();
    const liveById = new Map(live.map((row) => [row.agentId, row]));
    const period = await this.queryAgentPeriod(
      window.from,
      window.toExclusive,
    );
    const ids = new Set<string>([...liveById.keys(), ...period.keys()]);
    const cap = maxActiveTicketsPerAgent();
    const items: AgentPerformanceRow[] = [];
    for (const agentId of ids) {
      const snap = liveById.get(agentId);
      items.push({
        agentId,
        ...(period.get(agentId) ?? emptyMetrics()),
        activeCount: snap?.assigned ?? 0,
        inProgress: snap?.inProgress ?? 0,
        waitingForCustomer: snap?.waitingForCustomer ?? 0,
        waitingForHost: snap?.waitingForHost ?? 0,
        escalated: snap?.escalated ?? 0,
        workloadCap: cap,
      });
    }
    items.sort((a, b) => a.agentId.localeCompare(b.agentId));
    return items;
  }

  async forAgent(
    agentId: string,
    window: PerformanceWindow,
  ): Promise<AgentPerformanceRow> {
    const listed = await this.listAgentPerformance(window);
    return (
      listed.find((row) => row.agentId === agentId) ??
      emptyAgentRow(agentId, maxActiveTicketsPerAgent())
    );
  }

  async agentTrend(
    agentId: string,
    window: PerformanceWindow,
  ): Promise<
    Array<{
      period: 'previous' | 'current';
      from: string;
      to: string;
      averageAgentRating: number | null;
      problemSolvedRate: number | null;
      firstResponseSlaRate: number | null;
      resolutionSlaRate: number | null;
      reviewCount: number;
    }>
  > {
    const span = window.toExclusive.getTime() - window.from.getTime();
    const prevFrom = new Date(window.from.getTime() - span);
    const [previous, current] = await Promise.all([
      this.queryAgentPeriod(prevFrom, window.from),
      this.queryAgentPeriod(window.from, window.toExclusive),
    ]);
    const min = supportMinReviewsForQualitySignal();
    const mapPoint = (
      period: 'previous' | 'current',
      from: Date,
      to: Date,
      metrics: AgentPerformanceMetrics,
    ) => ({
      period,
      from: from.toISOString(),
      to: to.toISOString(),
      averageAgentRating:
        metrics.reviewCount >= min ? metrics.averageAgentRating : metrics.averageAgentRating,
      problemSolvedRate: metrics.problemSolvedRate,
      firstResponseSlaRate: metrics.firstResponseSlaRate,
      resolutionSlaRate: metrics.resolutionSlaRate,
      reviewCount: metrics.reviewCount,
    });
    return [
      mapPoint(
        'previous',
        prevFrom,
        window.from,
        previous.get(agentId) ?? emptyMetrics(),
      ),
      mapPoint(
        'current',
        window.from,
        window.toExclusive,
        current.get(agentId) ?? emptyMetrics(),
      ),
    ];
  }

  async categoryBreakdown(
    window: PerformanceWindow,
    agentId?: string,
  ): Promise<Array<CategoryPerformanceRow & { agentId?: string }>> {
    return this.queryCategories(window.from, window.toExclusive, agentId);
  }

  async languageBreakdown(
    window: PerformanceWindow,
  ): Promise<LanguagePerformanceRow[]> {
    return this.queryLanguages(window.from, window.toExclusive);
  }

  async cannedEffectiveness(
    window: PerformanceWindow,
  ): Promise<CannedEffectivenessRow[]> {
    return this.queryCanned(window.from, window.toExclusive);
  }

  async recentFeedback(
    agentId: string,
    window: PerformanceWindow,
    limit = 20,
  ): Promise<AgentFeedbackItem[]> {
    const rows = (await this.dataSource.query(
      `
      SELECT c.ticket_id, t.category, c.agent_rating, c.problem_solved,
             c.comment, c.submitted_at
      FROM stays_support_ticket_csat c
      JOIN stays_support_tickets t ON t.id = c.ticket_id
      WHERE c.agent_id = $1
        AND c.submitted_at >= $2::timestamptz
        AND c.submitted_at < $3::timestamptz
      ORDER BY c.submitted_at DESC
      LIMIT $4
      `,
      [agentId, window.from.toISOString(), window.toExclusive.toISOString(), limit],
    )) as Array<{
      ticket_id: string;
      category: string;
      agent_rating: number | string | null;
      problem_solved: boolean | null;
      comment: string | null;
      submitted_at: Date | string;
    }>;
    return rows.map((row) => ({
      ticketId: row.ticket_id,
      category: row.category,
      agentRating: row.agent_rating == null ? null : Number(row.agent_rating),
      problemSolved: row.problem_solved,
      comment: row.comment,
      submittedAt:
        row.submitted_at instanceof Date
          ? row.submitted_at.toISOString()
          : String(row.submitted_at),
    }));
  }

  async firstResponseAgentId(ticketId: string): Promise<string | null> {
    const rows = (await this.dataSource.query(
      `
      SELECT first_sender.sender_id AS agent_id
      FROM stays_support_tickets t
      ${FIRST_RESPONDER_LATERAL}
      WHERE t.id = $1
      LIMIT 1
      `,
      [ticketId],
    )) as { agent_id: string | null }[];
    return rows[0]?.agent_id ?? null;
  }

  async queryAgentPeriod(
    from: Date,
    toExclusive: Date,
    maturityDays = supportReopenMaturityDays(),
  ): Promise<Map<string, AgentPerformanceMetrics>> {
    const params = [from.toISOString(), toExclusive.toISOString()];
    const slaParams = [
      ...params,
      SUPPORT_SLA.LOW.firstResponseHours,
      SUPPORT_SLA.NORMAL.firstResponseHours,
      SUPPORT_SLA.HIGH.firstResponseHours,
      SUPPORT_SLA.URGENT.firstResponseHours,
      SUPPORT_SLA.LOW.resolutionHours,
      SUPPORT_SLA.NORMAL.resolutionHours,
      SUPPORT_SLA.HIGH.resolutionHours,
      SUPPORT_SLA.URGENT.resolutionHours,
    ];
    const assigned = (await this.dataSource.query(
      `
      SELECT metadata->>'toAdminId' AS agent_id, COUNT(*)::int AS assigned_count
      FROM stays_audit_logs
      WHERE action = 'support_ticket_assigned'
        AND created_at >= $1::timestamptz
        AND created_at < $2::timestamptz
        AND metadata->>'toAdminId' IS NOT NULL
        AND metadata->>'toAdminId' <> ''
      GROUP BY metadata->>'toAdminId'
      `,
      params,
    )) as { agent_id: string; assigned_count: number }[];
    const closed = (await this.dataSource.query(
      `
      SELECT t.review_agent_id AS agent_id,
        COUNT(*)::int AS tickets_closed,
        COUNT(*) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM stays_audit_logs a
            WHERE a.action = 'support_ticket_reopened'
              AND a.entity_type = 'support_ticket'
              AND a.entity_id = t.id::text
          )
        )::int AS tickets_reopened,
        COUNT(*) FILTER (
          WHERE t.closed_at < now() - ($3::int * INTERVAL '1 day')
        )::int AS matured_closed,
        COUNT(*) FILTER (
          WHERE t.closed_at < now() - ($3::int * INTERVAL '1 day')
            AND EXISTS (
              SELECT 1 FROM stays_audit_logs a
              WHERE a.action = 'support_ticket_reopened'
                AND a.entity_type = 'support_ticket'
                AND a.entity_id = t.id::text
            )
        )::int AS matured_reopened
      FROM stays_support_tickets t
      WHERE t.closed_at >= $1::timestamptz
        AND t.closed_at < $2::timestamptz
        AND t.review_agent_id IS NOT NULL
      GROUP BY t.review_agent_id
      `,
      [...params, maturityDays],
    )) as {
      agent_id: string;
      tickets_closed: number;
      tickets_reopened: number;
      matured_closed: number;
      matured_reopened: number;
    }[];
    const followUp = (await this.dataSource.query(
      `
      SELECT t.review_agent_id AS agent_id, COUNT(*)::int AS follow_up_count
      FROM stays_support_operational_signals s
      JOIN stays_support_tickets t ON t.id = s.ticket_id
      WHERE s.signal_type = 'FOLLOW_UP_REQUIRED'
        AND s.first_detected_at >= $1::timestamptz
        AND s.first_detected_at < $2::timestamptz
        AND t.review_agent_id IS NOT NULL
      GROUP BY t.review_agent_id
      `,
      params,
    )) as { agent_id: string; follow_up_count: number }[];
    const frHours = frHoursSql('t', 3, 4, 5, 6);
    const response = (await this.dataSource.query(
      `
      SELECT first_sender.sender_id AS agent_id,
        COUNT(*)::int AS sample_count,
        COUNT(*) FILTER (
          WHERE t.first_admin_response_at <= t.created_at + ((${frHours}) * INTERVAL '1 hour')
        )::int AS sla_met,
        COUNT(*) FILTER (
          WHERE t.first_admin_response_at > t.created_at + ((${frHours}) * INTERVAL '1 hour')
        )::int AS sla_breached,
        AVG(EXTRACT(EPOCH FROM (t.first_admin_response_at - t.created_at)))::float AS avg_seconds
      FROM stays_support_tickets t
      ${FIRST_RESPONDER_LATERAL}
      WHERE t.first_admin_response_at >= $1::timestamptz
        AND t.first_admin_response_at < $2::timestamptz
        AND first_sender.sender_id IS NOT NULL
      GROUP BY first_sender.sender_id
      `,
      slaParams.slice(0, 6),
    )) as {
      agent_id: string;
      sample_count: number;
      sla_met: number;
      sla_breached: number;
      avg_seconds: number | string | null;
    }[];
    const resHours = resHoursSql('t', 3, 4, 5, 6);
    const resolution = (await this.dataSource.query(
      `
      SELECT t.review_agent_id AS agent_id,
        COUNT(*)::int AS sample_count,
        COUNT(*) FILTER (
          WHERE t.resolved_at <= t.created_at + ((${resHours}) * INTERVAL '1 hour')
        )::int AS sla_met,
        COUNT(*) FILTER (
          WHERE t.resolved_at > t.created_at + ((${resHours}) * INTERVAL '1 hour')
        )::int AS sla_breached,
        AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)))::float AS avg_seconds
      FROM stays_support_tickets t
      WHERE t.resolved_at >= $1::timestamptz
        AND t.resolved_at < $2::timestamptz
        AND t.review_agent_id IS NOT NULL
      GROUP BY t.review_agent_id
      `,
      [
        ...params,
        SUPPORT_SLA.LOW.resolutionHours,
        SUPPORT_SLA.NORMAL.resolutionHours,
        SUPPORT_SLA.HIGH.resolutionHours,
        SUPPORT_SLA.URGENT.resolutionHours,
      ],
    )) as {
      agent_id: string;
      sample_count: number;
      sla_met: number;
      sla_breached: number;
      avg_seconds: number | string | null;
    }[];
    const csat = (await this.dataSource.query(
      `
      SELECT
        agent_id,
        COUNT(*)::int AS review_count,
        AVG(rating)::float AS average_overall_rating,
        AVG(agent_rating)::float AS average_agent_rating,
        COUNT(*) FILTER (WHERE problem_solved = true)::int AS solved_count,
        COUNT(*) FILTER (WHERE problem_solved = false)::int AS unsolved_count,
        COUNT(*) FILTER (WHERE agent_rating IS NOT NULL AND agent_rating < 1.5)::int AS r1,
        COUNT(*) FILTER (WHERE agent_rating >= 1.5 AND agent_rating < 2.5)::int AS r2,
        COUNT(*) FILTER (WHERE agent_rating >= 2.5 AND agent_rating < 3.5)::int AS r3,
        COUNT(*) FILTER (WHERE agent_rating >= 3.5 AND agent_rating < 4.5)::int AS r4,
        COUNT(*) FILTER (WHERE agent_rating >= 4.5)::int AS r5
      FROM stays_support_ticket_csat
      WHERE agent_id IS NOT NULL
        AND submitted_at >= $1::timestamptz
        AND submitted_at < $2::timestamptz
      GROUP BY agent_id
      `,
      params,
    )) as Array<{
      agent_id: string;
      review_count: number;
      average_overall_rating: number | string | null;
      average_agent_rating: number | string | null;
      solved_count: number;
      unsolved_count: number;
      r1: number;
      r2: number;
      r3: number;
      r4: number;
      r5: number;
    }>;

    const byId = new Map<string, AgentPerformanceMetrics>();
    const bump = (agentId: string) => {
      if (!agentId) return emptyMetrics();
      const existing = byId.get(agentId);
      if (existing) return existing;
      const created = emptyMetrics();
      byId.set(agentId, created);
      return created;
    };
    for (const row of assigned) {
      bump(row.agent_id).assignedCount = Number(row.assigned_count ?? 0);
    }
    for (const row of closed) {
      const metrics = bump(row.agent_id);
      metrics.ticketsClosed = Number(row.tickets_closed ?? 0);
      metrics.ticketsReopened = Number(row.tickets_reopened ?? 0);
      metrics.reopenRate =
        metrics.ticketsClosed > 0
          ? metrics.ticketsReopened / metrics.ticketsClosed
          : null;
      metrics.maturedTicketsClosed = Number(row.matured_closed ?? 0);
      metrics.maturedTicketsReopened = Number(row.matured_reopened ?? 0);
      metrics.maturedReopenRate =
        metrics.maturedTicketsClosed > 0
          ? metrics.maturedTicketsReopened / metrics.maturedTicketsClosed
          : null;
    }
    for (const row of followUp) {
      bump(row.agent_id).followUpRequiredCount = Number(row.follow_up_count ?? 0);
    }
    for (const row of response) {
      const metrics = bump(row.agent_id);
      metrics.firstResponseCount = Number(row.sample_count ?? 0);
      metrics.firstResponseSlaMet = Number(row.sla_met ?? 0);
      metrics.firstResponseSlaBreached = Number(row.sla_breached ?? 0);
      metrics.firstResponseSlaRate =
        metrics.firstResponseCount > 0
          ? metrics.firstResponseSlaMet / metrics.firstResponseCount
          : null;
      metrics.averageFirstResponseSeconds =
        row.avg_seconds == null ? null : Number(row.avg_seconds);
    }
    for (const row of resolution) {
      const metrics = bump(row.agent_id);
      metrics.resolutionCount = Number(row.sample_count ?? 0);
      metrics.resolutionSlaMet = Number(row.sla_met ?? 0);
      metrics.resolutionSlaBreached = Number(row.sla_breached ?? 0);
      metrics.resolutionSlaRate =
        metrics.resolutionCount > 0
          ? metrics.resolutionSlaMet / metrics.resolutionCount
          : null;
      metrics.averageResolutionSeconds =
        row.avg_seconds == null ? null : Number(row.avg_seconds);
    }
    for (const row of csat) {
      const metrics = bump(row.agent_id);
      const reviews = Number(row.review_count ?? 0);
      metrics.reviewCount = reviews;
      metrics.averageOverallRating =
        row.average_overall_rating == null
          ? null
          : Number(row.average_overall_rating);
      metrics.averageAgentRating =
        row.average_agent_rating == null
          ? null
          : Number(row.average_agent_rating);
      metrics.problemSolvedCount = Number(row.solved_count ?? 0);
      metrics.problemNotSolvedCount = Number(row.unsolved_count ?? 0);
      metrics.problemSolvedRate =
        reviews > 0 ? metrics.problemSolvedCount / reviews : null;
      metrics.agentRatingDistribution = {
        1: Number(row.r1 ?? 0),
        2: Number(row.r2 ?? 0),
        3: Number(row.r3 ?? 0),
        4: Number(row.r4 ?? 0),
        5: Number(row.r5 ?? 0),
      };
    }
    return byId;
  }

  private async queryCategories(
    from: Date,
    toExclusive: Date,
    agentId?: string,
  ): Promise<Array<CategoryPerformanceRow & { agentId?: string }>> {
    const params: unknown[] = [from.toISOString(), toExclusive.toISOString()];
    const agentFilter = agentId
      ? `AND c.agent_id = $${params.push(agentId)}`
      : '';
    const csat = (await this.dataSource.query(
      `
      SELECT t.category,
        COUNT(*)::int AS review_count,
        AVG(c.rating)::float AS average_overall_rating,
        AVG(c.agent_rating)::float AS average_agent_rating,
        COUNT(*) FILTER (WHERE c.problem_solved = true)::int AS solved_count
      FROM stays_support_ticket_csat c
      JOIN stays_support_tickets t ON t.id = c.ticket_id
      WHERE c.submitted_at >= $1::timestamptz
        AND c.submitted_at < $2::timestamptz
        ${agentFilter}
      GROUP BY t.category
      `,
      params,
    )) as Array<{
      category: string;
      review_count: number;
      average_overall_rating: number | string | null;
      average_agent_rating: number | string | null;
      solved_count: number;
    }>;
    const volumeParams: unknown[] = [from.toISOString(), toExclusive.toISOString()];
    const volumeAgent = agentId
      ? `AND t.review_agent_id = $${volumeParams.push(agentId)}`
      : '';
    const volume = (await this.dataSource.query(
      `
      SELECT t.category,
        COUNT(*)::int AS ticket_volume,
        COUNT(*) FILTER (WHERE t.closed_at >= $1::timestamptz AND t.closed_at < $2::timestamptz AND t.review_agent_id IS NOT NULL)::int AS tickets_closed,
        COUNT(*) FILTER (
          WHERE t.closed_at >= $1::timestamptz AND t.closed_at < $2::timestamptz
            AND t.review_agent_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM stays_audit_logs a
              WHERE a.action = 'support_ticket_reopened'
                AND a.entity_type = 'support_ticket'
                AND a.entity_id = t.id::text
            )
        )::int AS tickets_reopened
      FROM stays_support_tickets t
      WHERE t.created_at >= $1::timestamptz
        AND t.created_at < $2::timestamptz
        ${volumeAgent}
      GROUP BY t.category
      `,
      volumeParams,
    )) as Array<{
      category: string;
      ticket_volume: number;
      tickets_closed: number;
      tickets_reopened: number;
    }>;
    const sla = (await this.dataSource.query(
      `
      SELECT t.category,
        COUNT(*) FILTER (WHERE t.first_admin_response_at IS NOT NULL)::int AS fr_count,
        COUNT(*) FILTER (
          WHERE t.first_admin_response_at IS NOT NULL
            AND t.first_admin_response_at <= t.created_at + (
              (CASE t.priority WHEN 'LOW' THEN $3::int WHEN 'HIGH' THEN $5::int WHEN 'URGENT' THEN $6::int ELSE $4::int END)
              * INTERVAL '1 hour'
            )
        )::int AS fr_met,
        COUNT(*) FILTER (WHERE t.resolved_at IS NOT NULL)::int AS res_count,
        COUNT(*) FILTER (
          WHERE t.resolved_at IS NOT NULL
            AND t.resolved_at <= t.created_at + (
              (CASE t.priority WHEN 'LOW' THEN $7::int WHEN 'HIGH' THEN $9::int WHEN 'URGENT' THEN $10::int ELSE $8::int END)
              * INTERVAL '1 hour'
            )
        )::int AS res_met
      FROM stays_support_tickets t
      WHERE t.created_at >= $1::timestamptz
        AND t.created_at < $2::timestamptz
      GROUP BY t.category
      `,
      [
        from.toISOString(),
        toExclusive.toISOString(),
        SUPPORT_SLA.LOW.firstResponseHours,
        SUPPORT_SLA.NORMAL.firstResponseHours,
        SUPPORT_SLA.HIGH.firstResponseHours,
        SUPPORT_SLA.URGENT.firstResponseHours,
        SUPPORT_SLA.LOW.resolutionHours,
        SUPPORT_SLA.NORMAL.resolutionHours,
        SUPPORT_SLA.HIGH.resolutionHours,
        SUPPORT_SLA.URGENT.resolutionHours,
      ],
    )) as Array<{
      category: string;
      fr_count: number;
      fr_met: number;
      res_count: number;
      res_met: number;
    }>;
    const keys = new Set([
      ...csat.map((row) => row.category),
      ...volume.map((row) => row.category),
      ...sla.map((row) => row.category),
    ]);
    const csatBy = new Map(csat.map((row) => [row.category, row]));
    const volBy = new Map(volume.map((row) => [row.category, row]));
    const slaBy = new Map(sla.map((row) => [row.category, row]));
    return [...keys].sort().map((category) => {
      const c = csatBy.get(category);
      const v = volBy.get(category);
      const s = slaBy.get(category);
      const reviews = Number(c?.review_count ?? 0);
      const frCount = Number(s?.fr_count ?? 0);
      const resCount = Number(s?.res_count ?? 0);
      return {
        category,
        ticketVolume: Number(v?.ticket_volume ?? 0),
        reviewCount: reviews,
        averageOverallRating:
          c?.average_overall_rating == null
            ? null
            : Number(c.average_overall_rating),
        averageAgentRating:
          c?.average_agent_rating == null ? null : Number(c.average_agent_rating),
        problemSolvedRate:
          reviews > 0 ? Number(c?.solved_count ?? 0) / reviews : null,
        ticketsClosed: Number(v?.tickets_closed ?? 0),
        ticketsReopened: Number(v?.tickets_reopened ?? 0),
        firstResponseSlaRate:
          frCount > 0 ? Number(s?.fr_met ?? 0) / frCount : null,
        resolutionSlaRate:
          resCount > 0 ? Number(s?.res_met ?? 0) / resCount : null,
        ...(agentId ? { agentId } : {}),
      };
    });
  }

  private async queryLanguages(
    from: Date,
    toExclusive: Date,
  ): Promise<LanguagePerformanceRow[]> {
    const params = [from.toISOString(), toExclusive.toISOString()];
    const rows = (await this.dataSource.query(
      `
      SELECT COALESCE(t.requester_language, 'unknown') AS language,
        COUNT(*)::int AS ticket_volume,
        COUNT(c.id)::int AS review_count,
        AVG(c.rating)::float AS average_overall_rating,
        COUNT(c.id) FILTER (WHERE c.problem_solved = true)::int AS solved_count,
        COUNT(*) FILTER (WHERE t.first_admin_response_at IS NOT NULL)::int AS fr_count,
        COUNT(*) FILTER (
          WHERE t.first_admin_response_at IS NOT NULL
            AND t.first_admin_response_at <= t.created_at + (
              (CASE t.priority WHEN 'LOW' THEN $3::int WHEN 'HIGH' THEN $5::int WHEN 'URGENT' THEN $6::int ELSE $4::int END)
              * INTERVAL '1 hour'
            )
        )::int AS fr_met,
        COUNT(*) FILTER (WHERE t.resolved_at IS NOT NULL)::int AS res_count,
        COUNT(*) FILTER (
          WHERE t.resolved_at IS NOT NULL
            AND t.resolved_at <= t.created_at + (
              (CASE t.priority WHEN 'LOW' THEN $7::int WHEN 'HIGH' THEN $9::int WHEN 'URGENT' THEN $10::int ELSE $8::int END)
              * INTERVAL '1 hour'
            )
        )::int AS res_met
      FROM stays_support_tickets t
      LEFT JOIN stays_support_ticket_csat c
        ON c.ticket_id = t.id
       AND c.submitted_at >= $1::timestamptz
       AND c.submitted_at < $2::timestamptz
      WHERE t.created_at >= $1::timestamptz
        AND t.created_at < $2::timestamptz
      GROUP BY COALESCE(t.requester_language, 'unknown')
      `,
      [
        ...params,
        SUPPORT_SLA.LOW.firstResponseHours,
        SUPPORT_SLA.NORMAL.firstResponseHours,
        SUPPORT_SLA.HIGH.firstResponseHours,
        SUPPORT_SLA.URGENT.firstResponseHours,
        SUPPORT_SLA.LOW.resolutionHours,
        SUPPORT_SLA.NORMAL.resolutionHours,
        SUPPORT_SLA.HIGH.resolutionHours,
        SUPPORT_SLA.URGENT.resolutionHours,
      ],
    )) as Array<{
      language: string;
      ticket_volume: number;
      review_count: number;
      average_overall_rating: number | string | null;
      solved_count: number;
      fr_count: number;
      fr_met: number;
      res_count: number;
      res_met: number;
    }>;
    return rows.map((row) => {
      const reviews = Number(row.review_count ?? 0);
      const frCount = Number(row.fr_count ?? 0);
      const resCount = Number(row.res_count ?? 0);
      return {
        language: row.language,
        ticketVolume: Number(row.ticket_volume ?? 0),
        reviewCount: reviews,
        averageOverallRating:
          row.average_overall_rating == null
            ? null
            : Number(row.average_overall_rating),
        problemSolvedRate:
          reviews > 0 ? Number(row.solved_count ?? 0) / reviews : null,
        firstResponseSlaRate:
          frCount > 0 ? Number(row.fr_met ?? 0) / frCount : null,
        resolutionSlaRate:
          resCount > 0 ? Number(row.res_met ?? 0) / resCount : null,
      };
    });
  }

  private async queryCanned(
    from: Date,
    toExclusive: Date,
  ): Promise<CannedEffectivenessRow[]> {
    const rows = (await this.dataSource.query(
      `
      SELECT a.entity_id AS reply_id,
        r.title,
        COUNT(*)::int AS usage_count,
        COUNT(c.id)::int AS reviewed_count,
        AVG(c.rating)::float AS average_overall_rating,
        COUNT(c.id) FILTER (WHERE c.problem_solved = true)::int AS solved_count
      FROM stays_audit_logs a
      LEFT JOIN stays_support_canned_replies r ON r.id::text = a.entity_id
      LEFT JOIN stays_support_ticket_csat c
        ON c.ticket_id::text = a.metadata->>'ticketId'
      WHERE a.action = 'support_canned_reply_used'
        AND a.created_at >= $1::timestamptz
        AND a.created_at < $2::timestamptz
      GROUP BY a.entity_id, r.title
      ORDER BY COUNT(*) DESC
      `,
      [from.toISOString(), toExclusive.toISOString()],
    )) as Array<{
      reply_id: string;
      title: string | null;
      usage_count: number;
      reviewed_count: number;
      average_overall_rating: number | string | null;
      solved_count: number;
    }>;
    return rows.map((row) => {
      const reviewed = Number(row.reviewed_count ?? 0);
      return {
        replyId: row.reply_id,
        title: row.title,
        usageCount: Number(row.usage_count ?? 0),
        reviewedCount: reviewed,
        problemSolvedRate:
          reviewed > 0 ? Number(row.solved_count ?? 0) / reviewed : null,
        averageOverallRating:
          row.average_overall_rating == null
            ? null
            : Number(row.average_overall_rating),
      };
    });
  }
}

export function emptyMetrics(): AgentPerformanceMetrics {
  return {
    reviewCount: 0,
    averageAgentRating: null,
    averageOverallRating: null,
    agentRatingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    problemSolvedCount: 0,
    problemNotSolvedCount: 0,
    problemSolvedRate: null,
    ticketsClosed: 0,
    ticketsReopened: 0,
    reopenRate: null,
    maturedTicketsClosed: 0,
    maturedTicketsReopened: 0,
    maturedReopenRate: null,
    firstResponseCount: 0,
    firstResponseSlaMet: 0,
    firstResponseSlaBreached: 0,
    firstResponseSlaRate: null,
    averageFirstResponseSeconds: null,
    resolutionCount: 0,
    resolutionSlaMet: 0,
    resolutionSlaBreached: 0,
    resolutionSlaRate: null,
    averageResolutionSeconds: null,
    assignedCount: 0,
    followUpRequiredCount: 0,
  };
}

function emptyAgentRow(agentId: string, cap: number): AgentPerformanceRow {
  return {
    agentId,
    ...emptyMetrics(),
    activeCount: 0,
    inProgress: 0,
    waitingForCustomer: 0,
    waitingForHost: 0,
    escalated: 0,
    workloadCap: cap,
  };
}

export { SAMPLE_MIN };
