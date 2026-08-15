import { Injectable } from '@nestjs/common';
import {
  SupportPerformanceService,
  emptyMetrics,
  type AgentPerformanceMetrics,
  type AgentPerformanceRow,
} from './support-performance.service';
import { supportMinReviewsForQualitySignal } from './support-quality.config';

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
  constructor(private readonly performance: SupportPerformanceService) {}

  async listForAdmin(query: { from?: string; to?: string } = {}) {
    const window = this.performance.parseWindow(query);
    const span = window.toExclusive.getTime() - window.from.getTime();
    const prevFrom = new Date(window.from.getTime() - span);
    const [items, previous] = await Promise.all([
      this.performance.listAgentPerformance(window),
      this.performance.queryAgentPeriod(prevFrom, window.from),
    ]);
    const sampleMin = supportMinReviewsForQualitySignal();
    return {
      from: window.from.toISOString(),
      to: window.toExclusive.toISOString(),
      previousFrom: prevFrom.toISOString(),
      previousTo: window.from.toISOString(),
      items: items.map((row) =>
        this.toMetricsRow(row, previous.get(row.agentId) ?? emptyMetrics(), sampleMin),
      ),
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

  private toMetricsRow(
    row: AgentPerformanceRow,
    prev: AgentPerformanceMetrics,
    sampleMin: number,
  ): AgentMetricsRow {
    const csatTrend =
      row.reviewCount >= sampleMin && prev.reviewCount >= sampleMin;
    const responseTrend =
      row.firstResponseCount >= sampleMin && prev.firstResponseCount >= sampleMin;
    return {
      agentId: row.agentId,
      activeCount: row.activeCount,
      inProgress: row.inProgress,
      waitingForCustomer: row.waitingForCustomer,
      waitingForHost: row.waitingForHost,
      escalated: row.escalated,
      assignedCount: row.assignedCount,
      closedCount: row.ticketsClosed,
      reopenedCount: row.ticketsReopened,
      followUpRequiredCount: row.followUpRequiredCount,
      averageFirstResponseSeconds: row.averageFirstResponseSeconds,
      averageResolutionSeconds: row.averageResolutionSeconds,
      reviewCount: row.reviewCount,
      averageOverallRating: row.averageOverallRating,
      averageAgentRating: row.averageAgentRating,
      problemSolvedRate: row.problemSolvedRate,
      previous:
        prev.reviewCount >= sampleMin || prev.ticketsClosed >= sampleMin
          ? {
              assignedCount: prev.assignedCount,
              closedCount: prev.ticketsClosed,
              reopenedCount: prev.ticketsReopened,
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
                row.problemSolvedRate != null &&
                prev.problemSolvedRate != null
                  ? row.problemSolvedRate - prev.problemSolvedRate
                  : null,
              averageFirstResponseSecondsDelta:
                responseTrend &&
                row.averageFirstResponseSeconds != null &&
                prev.averageFirstResponseSeconds != null
                  ? row.averageFirstResponseSeconds -
                    prev.averageFirstResponseSeconds
                  : null,
            }
          : null,
    };
  }
}

function emptyAgentMetrics(agentId: string): AgentMetricsRow {
  return {
    agentId,
    activeCount: 0,
    inProgress: 0,
    waitingForCustomer: 0,
    waitingForHost: 0,
    escalated: 0,
    assignedCount: 0,
    closedCount: 0,
    reopenedCount: 0,
    followUpRequiredCount: 0,
    averageFirstResponseSeconds: null,
    averageResolutionSeconds: null,
    reviewCount: 0,
    averageOverallRating: null,
    averageAgentRating: null,
    problemSolvedRate: null,
    previous: null,
    trends: null,
  };
}
