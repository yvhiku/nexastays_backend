import { SupportQualitySignalsService } from './support-quality-signals.service';
import { emptyMetrics } from './support-performance.service';
import { signalDedupeKey } from './operational-signals.constants';

describe('SupportQualitySignalsService', () => {
  function build() {
    const performance = {
      parseWindow: jest.fn().mockReturnValue({
        from: new Date('2026-07-16T00:00:00.000Z'),
        toExclusive: new Date('2026-08-15T00:00:00.000Z'),
        range: '30d',
      }),
      forAgent: jest.fn(),
      queryAgentPeriod: jest.fn(),
      categoryBreakdown: jest.fn(),
      listAgentPerformance: jest.fn().mockResolvedValue([]),
      firstResponseAgentId: jest.fn().mockResolvedValue(null),
    };
    const ops = {
      applyPatternDesires: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SupportQualitySignalsService(
      performance as never,
      ops as never,
    );
    return { service, performance, ops };
  }

  it('does not create a CSAT pattern below the review minimum', async () => {
    const { service, performance, ops } = build();
    performance.forAgent.mockResolvedValue({
      ...emptyMetrics(),
      agentId: 'agent-1',
      reviewCount: 2,
      averageAgentRating: 2.0,
    });
    performance.queryAgentPeriod.mockResolvedValue(new Map());
    await service.evaluateAgentQuality('agent-1');
    const csatCalls = ops.applyPatternDesires.mock.calls.filter((call: unknown[]) =>
      JSON.stringify(call[0]).includes('AGENT_LOW_CSAT_PATTERN'),
    );
    expect(csatCalls).toHaveLength(0);
    expect(ops.applyPatternDesires).toHaveBeenCalledWith(
      expect.any(Array),
      expect.arrayContaining([
        signalDedupeKey('AGENT_LOW_CSAT_PATTERN', 'ADMIN', 'agent-1'),
      ]),
      expect.objectContaining({
        [signalDedupeKey('AGENT_LOW_CSAT_PATTERN', 'ADMIN', 'agent-1')]:
          expect.objectContaining({ resolution: 'METRIC_RECOVERED' }),
      }),
    );
  });

  it('creates AGENT_LOW_CSAT_PATTERN with enough low agent ratings', async () => {
    const { service, performance, ops } = build();
    performance.forAgent.mockResolvedValue({
      ...emptyMetrics(),
      agentId: 'agent-1',
      reviewCount: 8,
      averageAgentRating: 3.1,
      agentRatingDistribution: { 1: 2, 2: 1, 3: 2, 4: 2, 5: 1 },
    });
    performance.queryAgentPeriod.mockResolvedValue(new Map());
    await service.evaluateAgentQuality('agent-1');
    expect(ops.applyPatternDesires.mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'AGENT_LOW_CSAT_PATTERN' }),
      ]),
    );
  });

  it('creates AGENT_LOW_SOLVED_RATE independently of a high agent rating', async () => {
    const { service, performance, ops } = build();
    performance.forAgent.mockResolvedValue({
      ...emptyMetrics(),
      agentId: 'agent-1',
      reviewCount: 20,
      averageAgentRating: 4.6,
      problemSolvedRate: 0.6,
    });
    performance.queryAgentPeriod.mockResolvedValue(new Map());
    await service.evaluateAgentQuality('agent-1');
    expect(ops.applyPatternDesires.mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'AGENT_LOW_SOLVED_RATE' }),
      ]),
    );
    expect(ops.applyPatternDesires.mock.calls[0][0]).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'AGENT_LOW_CSAT_PATTERN' }),
      ]),
    );
  });

  it('does not create AGENT_SLA_DECLINE when recent SLA stays above the absolute target', async () => {
    const { service, performance, ops } = build();
    performance.queryAgentPeriod
      .mockResolvedValueOnce(
        new Map([
          [
            'agent-1',
            { ...emptyMetrics(), firstResponseCount: 12, firstResponseSlaRate: 0.93 },
          ],
        ]),
      )
      .mockResolvedValueOnce(
        new Map([
          [
            'agent-1',
            { ...emptyMetrics(), firstResponseCount: 40, firstResponseSlaRate: 0.99 },
          ],
        ]),
      );
    await service.evaluateAgentSlaDecline('agent-1');
    expect(ops.applyPatternDesires).toHaveBeenCalledWith(
      [],
      [signalDedupeKey('AGENT_SLA_DECLINE', 'ADMIN', 'agent-1')],
      expect.any(Object),
    );
  });

  it('creates AGENT_SLA_DECLINE when volume, absolute target, and decline all fail', async () => {
    const { service, performance, ops } = build();
    performance.queryAgentPeriod
      .mockResolvedValueOnce(
        new Map([
          [
            'agent-1',
            { ...emptyMetrics(), firstResponseCount: 12, firstResponseSlaRate: 0.65 },
          ],
        ]),
      )
      .mockResolvedValueOnce(
        new Map([
          [
            'agent-1',
            { ...emptyMetrics(), firstResponseCount: 40, firstResponseSlaRate: 0.9 },
          ],
        ]),
      );
    await service.evaluateAgentSlaDecline('agent-1');
    expect(ops.applyPatternDesires.mock.calls[0][0]).toEqual([
      expect.objectContaining({ type: 'AGENT_SLA_DECLINE' }),
    ]);
  });

  it('does not create AGENT_SLA_DECLINE when recent volume is below the minimum', async () => {
    const { service, performance, ops } = build();
    performance.queryAgentPeriod
      .mockResolvedValueOnce(
        new Map([
          [
            'agent-1',
            { ...emptyMetrics(), firstResponseCount: 4, firstResponseSlaRate: 0.5 },
          ],
        ]),
      )
      .mockResolvedValueOnce(
        new Map([
          [
            'agent-1',
            { ...emptyMetrics(), firstResponseCount: 40, firstResponseSlaRate: 0.9 },
          ],
        ]),
      );
    await service.evaluateAgentSlaDecline('agent-1');
    expect(ops.applyPatternDesires).toHaveBeenCalledWith(
      [],
      [signalDedupeKey('AGENT_SLA_DECLINE', 'ADMIN', 'agent-1')],
      expect.any(Object),
    );
  });

  it('creates CATEGORY_OUTCOME_DECLINE vs the previous window, not a static 70% floor', async () => {
    const { service, performance, ops } = build();
    performance.categoryBreakdown
      .mockResolvedValueOnce([
        { category: 'PAYMENTS', reviewCount: 10, problemSolvedRate: 0.75 },
      ])
      .mockResolvedValueOnce([
        { category: 'PAYMENTS', reviewCount: 10, problemSolvedRate: 0.98 },
      ]);
    await service.evaluateCategoryOutcome('PAYMENTS');
    expect(ops.applyPatternDesires.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        type: 'CATEGORY_OUTCOME_DECLINE',
        subjectType: 'CATEGORY',
        ticketId: null,
      }),
    ]);
  });

  it('does not create CATEGORY_OUTCOME_DECLINE when either window is below the review minimum', async () => {
    const { service, performance, ops } = build();
    performance.categoryBreakdown
      .mockResolvedValueOnce([
        { category: 'PAYMENTS', reviewCount: 2, problemSolvedRate: 0.4 },
      ])
      .mockResolvedValueOnce([
        { category: 'PAYMENTS', reviewCount: 10, problemSolvedRate: 0.9 },
      ]);
    await service.evaluateCategoryOutcome('PAYMENTS');
    expect(ops.applyPatternDesires).toHaveBeenCalledWith(
      [],
      [signalDedupeKey('CATEGORY_OUTCOME_DECLINE', 'CATEGORY', 'PAYMENTS')],
      expect.any(Object),
    );
  });
});
