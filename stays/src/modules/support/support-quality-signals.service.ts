import { Injectable } from '@nestjs/common';
import { OperationalIntelligenceService } from './operational-intelligence.service';
import { SupportPerformanceService } from './support-performance.service';
import { SUPPORT_TICKET_CATEGORIES } from './dto/support-ticket.dto';
import {
  signalDedupeKey,
  type OperationalSignalSeverity,
} from './operational-signals.constants';
import {
  supportCategoryBaselineDays,
  supportCategoryDeclinePoints,
  supportCategoryRecentDays,
  supportLowAgentRatingHighSeverity,
  supportLowAgentRatingThreshold,
  supportMinReviewsForCategorySignal,
  supportMinReviewsForQualitySignal,
  supportMinSolvedRate,
  supportMinTicketsForSlaSignal,
  supportQualityWindowDays,
  supportSlaAbsoluteTarget,
  supportSlaBaselineDays,
  supportSlaDeclinePoints,
  supportSlaRecentDays,
} from './support-quality.config';

@Injectable()
export class SupportQualitySignalsService {
  constructor(
    private readonly performance: SupportPerformanceService,
    private readonly ops: OperationalIntelligenceService,
  ) {}

  async evaluateAfterCsat(agentId: string | null | undefined, category: string) {
    if (agentId) await this.evaluateAgentQuality(agentId);
    await this.evaluateCategoryOutcome(category);
  }

  async evaluateAfterLifecycle(input: {
    reviewAgentId?: string | null;
    ticketId?: string;
  }) {
    if (input.reviewAgentId) {
      await this.evaluateAgentQuality(input.reviewAgentId);
    }
    if (input.ticketId) {
      const first = await this.performance.firstResponseAgentId(input.ticketId);
      if (first) await this.evaluateAgentSlaDecline(first);
    }
  }

  async evaluateAgentQuality(agentId: string) {
    const days = supportQualityWindowDays();
    const window = this.performance.parseWindow({ range: '30d' });
    window.from = new Date(window.toExclusive.getTime() - days * 86400000);
    const metrics = await this.performance.forAgent(agentId, window);
    const min = supportMinReviewsForQualitySignal();
    const csatKey = signalDedupeKey('AGENT_LOW_CSAT_PATTERN', 'ADMIN', agentId);
    const solvedKey = signalDedupeKey('AGENT_LOW_SOLVED_RATE', 'ADMIN', agentId);
    const upserts = [];
    const resolveKeys: string[] = [];
    const resolveMetadata: Record<string, Record<string, unknown>> = {};

    const rating = metrics.averageAgentRating;
    if (
      metrics.reviewCount >= min &&
      rating != null &&
      rating < supportLowAgentRatingThreshold()
    ) {
      const severity: OperationalSignalSeverity =
        rating <= supportLowAgentRatingHighSeverity() ? 'HIGH' : 'MEDIUM';
      upserts.push({
        type: 'AGENT_LOW_CSAT_PATTERN' as const,
        severity,
        subjectType: 'ADMIN' as const,
        subjectId: agentId,
        metadata: {
          code: 'AGENT_LOW_CSAT_PATTERN' as const,
          windowDays: days,
          reviewCount: metrics.reviewCount,
          averageAgentRating: rating,
          distribution: metrics.agentRatingDistribution,
        },
      });
    } else {
      resolveKeys.push(csatKey);
      resolveMetadata[csatKey] = {
        resolution: 'METRIC_RECOVERED',
        previousAverage: rating,
        currentAverage: rating,
        reviewCount: metrics.reviewCount,
      };
    }

    const solved = metrics.problemSolvedRate;
    if (
      metrics.reviewCount >= min &&
      solved != null &&
      solved < supportMinSolvedRate()
    ) {
      upserts.push({
        type: 'AGENT_LOW_SOLVED_RATE' as const,
        severity: 'MEDIUM' as const,
        subjectType: 'ADMIN' as const,
        subjectId: agentId,
        metadata: {
          code: 'AGENT_LOW_SOLVED_RATE' as const,
          windowDays: days,
          reviewCount: metrics.reviewCount,
          problemSolvedRate: solved,
          averageAgentRating: metrics.averageAgentRating,
        },
      });
    } else {
      resolveKeys.push(solvedKey);
      resolveMetadata[solvedKey] = {
        resolution: 'METRIC_RECOVERED',
        currentSolvedRate: solved,
        reviewCount: metrics.reviewCount,
      };
    }

    await this.ops.applyPatternDesires(upserts, resolveKeys, resolveMetadata);
    await this.evaluateAgentSlaDecline(agentId);
  }

  async evaluateAgentSlaDecline(agentId: string) {
    const recentDays = supportSlaRecentDays();
    const baselineDays = supportSlaBaselineDays();
    const now = new Date();
    const recentFrom = new Date(now.getTime() - recentDays * 86400000);
    const baselineFrom = new Date(recentFrom.getTime() - baselineDays * 86400000);
    const [recentMap, baselineMap] = await Promise.all([
      this.performance.queryAgentPeriod(recentFrom, now),
      this.performance.queryAgentPeriod(baselineFrom, recentFrom),
    ]);
    const recent = recentMap.get(agentId);
    const baseline = baselineMap.get(agentId);
    const key = signalDedupeKey('AGENT_SLA_DECLINE', 'ADMIN', agentId);
    const minVol = supportMinTicketsForSlaSignal();
    const recentRate = recent?.firstResponseSlaRate ?? null;
    const baselineRate = baseline?.firstResponseSlaRate ?? null;
    const recentVol = recent?.firstResponseCount ?? 0;
    const baselineVol = baseline?.firstResponseCount ?? 0;
    const shouldSignal =
      recentVol >= minVol &&
      baselineVol >= minVol &&
      recentRate != null &&
      baselineRate != null &&
      recentRate < supportSlaAbsoluteTarget() &&
      baselineRate - recentRate >= supportSlaDeclinePoints();
    if (shouldSignal) {
      await this.ops.applyPatternDesires(
        [
          {
            type: 'AGENT_SLA_DECLINE',
            severity: 'MEDIUM',
            subjectType: 'ADMIN',
            subjectId: agentId,
            metadata: {
              code: 'AGENT_SLA_DECLINE',
              recentDays,
              baselineDays,
              recentVolume: recentVol,
              baselineVolume: baselineVol,
              recentSla: recentRate,
              baselineSla: baselineRate,
              declinePoints: baselineRate - recentRate,
            },
          },
        ],
        [],
      );
      return;
    }
    await this.ops.applyPatternDesires([], [key], {
      [key]: {
        resolution: 'METRIC_RECOVERED',
        recentSla: recentRate,
        baselineSla: baselineRate,
      },
    });
  }

  async evaluateCategoryOutcome(category: string) {
    const recentDays = supportCategoryRecentDays();
    const baselineDays = supportCategoryBaselineDays();
    const now = new Date();
    const recentFrom = new Date(now.getTime() - recentDays * 86400000);
    const baselineFrom = new Date(recentFrom.getTime() - baselineDays * 86400000);
    const recentWindow = {
      from: recentFrom,
      toExclusive: now,
      range: '30d' as const,
    };
    const baselineWindow = {
      from: baselineFrom,
      toExclusive: recentFrom,
      range: '30d' as const,
    };
    const [recentRows, baselineRows] = await Promise.all([
      this.performance.categoryBreakdown(recentWindow),
      this.performance.categoryBreakdown(baselineWindow),
    ]);
    const recent = recentRows.find((row) => row.category === category);
    const previous = baselineRows.find((row) => row.category === category);
    const key = signalDedupeKey('CATEGORY_OUTCOME_DECLINE', 'CATEGORY', category);
    const min = supportMinReviewsForCategorySignal();
    const recentRate = recent?.problemSolvedRate ?? null;
    const prevRate = previous?.problemSolvedRate ?? null;
    const shouldSignal =
      (recent?.reviewCount ?? 0) >= min &&
      (previous?.reviewCount ?? 0) >= min &&
      recentRate != null &&
      prevRate != null &&
      prevRate - recentRate >= supportCategoryDeclinePoints();
    if (shouldSignal) {
      await this.ops.applyPatternDesires(
        [
          {
            type: 'CATEGORY_OUTCOME_DECLINE',
            severity: 'MEDIUM',
            subjectType: 'CATEGORY',
            subjectId: category,
            ticketId: null,
            metadata: {
              code: 'CATEGORY_OUTCOME_DECLINE',
              category,
              windowDays: recentDays,
              reviewCount: recent?.reviewCount ?? 0,
              solvedRate: recentRate,
              previousSolvedRate: prevRate,
              declinePoints: prevRate - recentRate,
            },
          },
        ],
        [],
      );
      return;
    }
    await this.ops.applyPatternDesires([], [key], {
      [key]: {
        resolution: 'METRIC_RECOVERED',
        currentAverage: recentRate,
        previousAverage: prevRate,
      },
    });
  }

  async reconcileAll() {
    const agents = await this.performance.listAgentPerformance(
      this.performance.parseWindow({ range: '30d' }),
    );
    for (const agent of agents) {
      try {
        await this.evaluateAgentQuality(agent.agentId);
      } catch {
        /* bounded; continue */
      }
    }
    for (const category of SUPPORT_TICKET_CATEGORIES) {
      try {
        await this.evaluateCategoryOutcome(category);
      } catch {
        /* bounded; continue */
      }
    }
  }
}
