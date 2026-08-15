import { SupportPerformanceSnapshotService } from './support-performance-snapshot.service';
import { emptyMetrics } from './support-performance.service';

describe('SupportPerformanceSnapshotService', () => {
  it('upserts the UTC day window, not a 30-day rollup', async () => {
    const repo = { query: jest.fn().mockResolvedValue(undefined) };
    const performance = {
      queryAgentPeriod: jest.fn().mockResolvedValue(
        new Map([['agent-1', { ...emptyMetrics(), reviewCount: 2 }]]),
      ),
    };
    const service = new SupportPerformanceSnapshotService(
      repo as never,
      performance as never,
    );
    const result = await service.upsertUtcDay('2026-08-14');
    expect(result.snapshotDate).toBe('2026-08-14');
    expect(result.from).toBe('2026-08-14T00:00:00.000Z');
    expect(result.to).toBe('2026-08-15T00:00:00.000Z');
    expect(result.dataFreshness).toBe('DAILY_RECONCILED');
    expect(performance.queryAgentPeriod).toHaveBeenCalledWith(
      new Date('2026-08-14T00:00:00.000Z'),
      new Date('2026-08-15T00:00:00.000Z'),
    );
    expect(String(repo.query.mock.calls[0][0])).toContain('ON CONFLICT');
    await service.upsertUtcDay('2026-08-14');
    expect(repo.query).toHaveBeenCalledTimes(2);
  });
});
