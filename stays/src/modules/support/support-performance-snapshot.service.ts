import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaysSupportAgentPerformanceSnapshot } from './entities/stays-support-agent-performance-snapshot.entity';
import { SupportPerformanceService } from './support-performance.service';
import { utcDayWindow } from './support-quality.config';

@Injectable()
export class SupportPerformanceSnapshotService {
  constructor(
    @InjectRepository(StaysSupportAgentPerformanceSnapshot)
    private readonly repo: Repository<StaysSupportAgentPerformanceSnapshot>,
    private readonly performance: SupportPerformanceService,
  ) {}

  async upsertUtcDay(snapshotDate: string) {
    const window = utcDayWindow(snapshotDate);
    const period = await this.performance.queryAgentPeriod(
      window.from,
      window.toExclusive,
    );
    let upserted = 0;
    for (const [agentId, metrics] of period) {
      await this.repo.query(
        `
        INSERT INTO stays_support_agent_performance_snapshots (
          agent_user_id, snapshot_date,
          tickets_closed, tickets_reopened,
          review_count, average_agent_rating,
          problem_solved_count, problem_not_solved_count, problem_solved_rate,
          overall_average_rating,
          first_response_count, first_response_sla_met, first_response_sla_rate,
          resolution_count, resolution_sla_met, resolution_sla_rate,
          average_first_response_seconds, average_resolution_seconds,
          updated_at
        ) VALUES (
          $1, $2::date,
          $3, $4,
          $5, $6,
          $7, $8, $9,
          $10,
          $11, $12, $13,
          $14, $15, $16,
          $17, $18,
          now()
        )
        ON CONFLICT (agent_user_id, snapshot_date)
        DO UPDATE SET
          tickets_closed = EXCLUDED.tickets_closed,
          tickets_reopened = EXCLUDED.tickets_reopened,
          review_count = EXCLUDED.review_count,
          average_agent_rating = EXCLUDED.average_agent_rating,
          problem_solved_count = EXCLUDED.problem_solved_count,
          problem_not_solved_count = EXCLUDED.problem_not_solved_count,
          problem_solved_rate = EXCLUDED.problem_solved_rate,
          overall_average_rating = EXCLUDED.overall_average_rating,
          first_response_count = EXCLUDED.first_response_count,
          first_response_sla_met = EXCLUDED.first_response_sla_met,
          first_response_sla_rate = EXCLUDED.first_response_sla_rate,
          resolution_count = EXCLUDED.resolution_count,
          resolution_sla_met = EXCLUDED.resolution_sla_met,
          resolution_sla_rate = EXCLUDED.resolution_sla_rate,
          average_first_response_seconds = EXCLUDED.average_first_response_seconds,
          average_resolution_seconds = EXCLUDED.average_resolution_seconds,
          updated_at = now()
        `,
        [
          agentId,
          snapshotDate,
          metrics.ticketsClosed,
          metrics.ticketsReopened,
          metrics.reviewCount,
          metrics.averageAgentRating,
          metrics.problemSolvedCount,
          metrics.problemNotSolvedCount,
          metrics.problemSolvedRate,
          metrics.averageOverallRating,
          metrics.firstResponseCount,
          metrics.firstResponseSlaMet,
          metrics.firstResponseSlaRate,
          metrics.resolutionCount,
          metrics.resolutionSlaMet,
          metrics.resolutionSlaRate,
          metrics.averageFirstResponseSeconds == null
            ? null
            : Math.round(metrics.averageFirstResponseSeconds),
          metrics.averageResolutionSeconds == null
            ? null
            : Math.round(metrics.averageResolutionSeconds),
        ],
      );
      upserted += 1;
    }
    return {
      snapshotDate,
      from: window.from.toISOString(),
      to: window.toExclusive.toISOString(),
      generatedAt: new Date().toISOString(),
      dataFreshness: 'DAILY_RECONCILED' as const,
      upserted,
    };
  }
}
