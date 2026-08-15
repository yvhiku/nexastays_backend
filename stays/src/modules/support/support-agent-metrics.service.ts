import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OperationalIntelligenceService } from './operational-intelligence.service';

const SAMPLE_MIN = 5;
const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_MS = 30 * 24 * 60 * 60 * 1000;

export type AgentPeriodMetrics = {
  assignedCount: number;
  closedCount: number;
  reopenedCount: number;
  followUpRequiredCount: number;
  firstResponseCount: number;
  averageFirstResponseSeconds: number | null;
  averageResolutionSeconds: number | null;
  reviewCount: number;
  averageOverallRating: number | null;
  averageAgentRating: number | null;
  problemSolvedRate: number | null;
};

export type AgentMetricsRow = Omit<AgentPeriodMetrics, 'firstResponseCount'> & {
  agentId: string;
  activeCount: number;
  inProgress: number;
  waitingForCustomer: number;
  waitingForHost: number;
  escalated: number;
  previous: AgentPeriodMetrics | null;
  trends: {
    problemSolvedRateDelta: number | null;
    averageFirstResponseSecondsDelta: number | null;
  } | null;
};

@Injectable()
export class SupportAgentMetricsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ops: OperationalIntelligenceService,
  ) {}

  async listForAdmin(query: { from?: string; to?: string } = {}) {
    const window = this.parseWindow(query);
    const items = await this.computeAll(window);
    return {
      from: window.from.toISOString(),
      to: window.toExclusive.toISOString(),
      previousFrom: window.prevFrom.toISOString(),
      previousTo: window.from.toISOString(),
      items,
    };
  }

  async forAgent(
    agentId: string,
    query: { from?: string; to?: string } = {},
  ) {
    const listed = await this.listForAdmin(query);
    const item =
      listed.items.find((row) => row.agentId === agentId) ??
      emptyAgentMetrics(agentId);
    return {
      from: listed.from,
      to: listed.to,
      previousFrom: listed.previousFrom,
      previousTo: listed.previousTo,
      ...item,
    };
  }

  private parseWindow(query: { from?: string; to?: string }) {
    const now = new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(now.getTime() - DEFAULT_RANGE_MS);
    const toExclusive = query.to
      ? new Date(query.to)
      : new Date(now.getTime() + 1);
    if (Number.isNaN(from.getTime()) || Number.isNaN(toExclusive.getTime())) {
      throw new BadRequestException('Invalid from/to date');
    }
    if (from >= toExclusive) {
      throw new BadRequestException('from must be before to');
    }
    if (toExclusive.getTime() - from.getTime() > MAX_RANGE_MS) {
      throw new BadRequestException('Date range must be 90 days or less');
    }
    const span = toExclusive.getTime() - from.getTime();
    return {
      from,
      toExclusive,
      prevFrom: new Date(from.getTime() - span),
    };
  }

  private async computeAll(window: {
    from: Date;
    toExclusive: Date;
    prevFrom: Date;
  }): Promise<AgentMetricsRow[]> {
    const live = await this.ops.queryAssignedAgentWorkload();
    const liveById = new Map(live.map((row) => [row.agentId, row]));
    const current = await this.queryPeriod(window.from, window.toExclusive);
    const previous = await this.queryPeriod(window.prevFrom, window.from);
    const ids = new Set<string>([
      ...liveById.keys(),
      ...current.keys(),
      ...previous.keys(),
    ]);
    const items: AgentMetricsRow[] = [];
    for (const agentId of ids) {
      const snap = liveById.get(agentId);
      const period = current.get(agentId) ?? emptyPeriod();
      const prev = previous.get(agentId) ?? emptyPeriod();
      const csatTrend =
        period.reviewCount >= SAMPLE_MIN && prev.reviewCount >= SAMPLE_MIN;
      const responseTrend =
        period.firstResponseCount >= SAMPLE_MIN &&
        prev.firstResponseCount >= SAMPLE_MIN;
      items.push({
        agentId,
        activeCount: snap?.assigned ?? 0,
        inProgress: snap?.inProgress ?? 0,
        waitingForCustomer: snap?.waitingForCustomer ?? 0,
        waitingForHost: snap?.waitingForHost ?? 0,
        escalated: snap?.escalated ?? 0,
        assignedCount: period.assignedCount,
        closedCount: period.closedCount,
        reopenedCount: period.reopenedCount,
        followUpRequiredCount: period.followUpRequiredCount,
        averageFirstResponseSeconds: period.averageFirstResponseSeconds,
        averageResolutionSeconds: period.averageResolutionSeconds,
        reviewCount: period.reviewCount,
        averageOverallRating: period.averageOverallRating,
        averageAgentRating: period.averageAgentRating,
        problemSolvedRate: period.problemSolvedRate,
        previous: prev.reviewCount >= SAMPLE_MIN || prev.closedCount >= SAMPLE_MIN
          ? {
              assignedCount: prev.assignedCount,
              closedCount: prev.closedCount,
              reopenedCount: prev.reopenedCount,
              followUpRequiredCount: prev.followUpRequiredCount,
              firstResponseCount: prev.firstResponseCount,
              averageFirstResponseSeconds: prev.averageFirstResponseSeconds,
              averageResolutionSeconds: prev.averageResolutionSeconds,
              reviewCount: prev.reviewCount,
              averageOverallRating: prev.averageOverallRating,
              averageAgentRating: prev.averageAgentRating,
              problemSolvedRate: prev.problemSolvedRate,
            }
          : null,
        trends:
          csatTrend || responseTrend
            ? {
                problemSolvedRateDelta:
                  csatTrend &&
                  period.problemSolvedRate != null &&
                  prev.problemSolvedRate != null
                    ? period.problemSolvedRate - prev.problemSolvedRate
                    : null,
                averageFirstResponseSecondsDelta:
                  responseTrend &&
                  period.averageFirstResponseSeconds != null &&
                  prev.averageFirstResponseSeconds != null
                    ? period.averageFirstResponseSeconds -
                      prev.averageFirstResponseSeconds
                    : null,
              }
            : null,
      });
    }
    items.sort((a, b) => a.agentId.localeCompare(b.agentId));
    return items;
  }

  private async queryPeriod(
    from: Date,
    toExclusive: Date,
  ): Promise<Map<string, AgentPeriodMetrics>> {
    const params = [from.toISOString(), toExclusive.toISOString()];
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
      SELECT review_agent_id AS agent_id, COUNT(*)::int AS closed_count
      FROM stays_support_tickets
      WHERE closed_at >= $1::timestamptz
        AND closed_at < $2::timestamptz
        AND review_agent_id IS NOT NULL
      GROUP BY review_agent_id
      `,
      params,
    )) as { agent_id: string; closed_count: number }[];
    const reopened = (await this.dataSource.query(
      `
      SELECT t.review_agent_id AS agent_id, COUNT(*)::int AS reopened_count
      FROM stays_audit_logs a
      JOIN stays_support_tickets t ON t.id::text = a.entity_id
      WHERE a.action = 'support_ticket_reopened'
        AND a.entity_type = 'support_ticket'
        AND a.created_at >= $1::timestamptz
        AND a.created_at < $2::timestamptz
        AND t.review_agent_id IS NOT NULL
      GROUP BY t.review_agent_id
      `,
      params,
    )) as { agent_id: string; reopened_count: number }[];
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
    const response = (await this.dataSource.query(
      `
      SELECT first_sender.sender_id AS agent_id,
        COUNT(*)::int AS sample_count,
        AVG(EXTRACT(EPOCH FROM (t.first_admin_response_at - t.created_at)))::float AS avg_seconds
      FROM stays_support_tickets t
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
      WHERE t.first_admin_response_at >= $1::timestamptz
        AND t.first_admin_response_at < $2::timestamptz
        AND first_sender.sender_id IS NOT NULL
      GROUP BY first_sender.sender_id
      `,
      params,
    )) as {
      agent_id: string;
      sample_count: number;
      avg_seconds: number | string | null;
    }[];
    const resolution = (await this.dataSource.query(
      `
      SELECT review_agent_id AS agent_id,
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)))::float AS avg_seconds
      FROM stays_support_tickets
      WHERE resolved_at >= $1::timestamptz
        AND resolved_at < $2::timestamptz
        AND review_agent_id IS NOT NULL
      GROUP BY review_agent_id
      `,
      params,
    )) as { agent_id: string; avg_seconds: number | string | null }[];
    const csat = (await this.dataSource.query(
      `
      SELECT
        agent_id,
        COUNT(*)::int AS review_count,
        AVG(rating)::float AS average_overall_rating,
        AVG(agent_rating)::float AS average_agent_rating,
        COUNT(*) FILTER (WHERE problem_solved = true)::int AS solved_count
      FROM stays_support_ticket_csat
      WHERE agent_id IS NOT NULL
        AND submitted_at >= $1::timestamptz
        AND submitted_at < $2::timestamptz
      GROUP BY agent_id
      `,
      params,
    )) as {
      agent_id: string;
      review_count: number;
      average_overall_rating: number | string | null;
      average_agent_rating: number | string | null;
      solved_count: number;
    }[];

    const byId = new Map<string, AgentPeriodMetrics>();
    const bump = (agentId: string) => {
      if (!agentId) return emptyPeriod();
      const existing = byId.get(agentId);
      if (existing) return existing;
      const created = emptyPeriod();
      byId.set(agentId, created);
      return created;
    };
    for (const row of assigned) {
      bump(row.agent_id).assignedCount = Number(row.assigned_count ?? 0);
    }
    for (const row of closed) {
      bump(row.agent_id).closedCount = Number(row.closed_count ?? 0);
    }
    for (const row of reopened) {
      bump(row.agent_id).reopenedCount = Number(row.reopened_count ?? 0);
    }
    for (const row of followUp) {
      bump(row.agent_id).followUpRequiredCount = Number(row.follow_up_count ?? 0);
    }
    for (const row of response) {
      const metrics = bump(row.agent_id);
      metrics.firstResponseCount = Number(row.sample_count ?? 0);
      metrics.averageFirstResponseSeconds =
        row.avg_seconds == null ? null : Number(row.avg_seconds);
    }
    for (const row of resolution) {
      bump(row.agent_id).averageResolutionSeconds =
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
      metrics.problemSolvedRate =
        reviews > 0 ? Number(row.solved_count ?? 0) / reviews : null;
    }
    return byId;
  }
}

function emptyPeriod(): AgentPeriodMetrics {
  return {
    assignedCount: 0,
    closedCount: 0,
    reopenedCount: 0,
    followUpRequiredCount: 0,
    firstResponseCount: 0,
    averageFirstResponseSeconds: null,
    averageResolutionSeconds: null,
    reviewCount: 0,
    averageOverallRating: null,
    averageAgentRating: null,
    problemSolvedRate: null,
  };
}

function emptyAgentMetrics(agentId: string): AgentMetricsRow {
  return {
    agentId,
    activeCount: 0,
    inProgress: 0,
    waitingForCustomer: 0,
    waitingForHost: 0,
    escalated: 0,
    ...emptyPeriod(),
    previous: null,
    trends: null,
  };
}
