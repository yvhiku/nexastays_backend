import { SupportAgentMetricsService } from './support-agent-metrics.service';
import { emptyMetrics } from './support-performance.service';

describe('SupportAgentMetricsService', () => {
  function build() {
    const performance = {
      parseWindow: jest.fn().mockReturnValue({
        from: new Date('2026-07-01T00:00:00.000Z'),
        toExclusive: new Date('2026-08-01T00:00:00.000Z'),
        range: '30d',
      }),
      listAgentPerformance: jest.fn().mockResolvedValue([
        {
          agentId: 'agent-1',
          ...emptyMetrics(),
          ticketsClosed: 4,
          assignedCount: 2,
          reviewCount: 2,
          problemSolvedRate: 1,
          averageOverallRating: 4,
          averageAgentRating: 5,
          activeCount: 3,
          inProgress: 1,
          waitingForCustomer: 1,
          waitingForHost: 0,
          escalated: 0,
          workloadCap: 20,
        },
      ]),
      queryAgentPeriod: jest.fn().mockResolvedValue(new Map()),
    };
    const service = new SupportAgentMetricsService(performance as never);
    return { service, performance };
  }

  it('maps canonical ticketsClosed onto Loop 3 closedCount', async () => {
    const { service } = build();
    const listed = await service.listForAdmin({
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
    });
    const row = listed.items.find((item) => item.agentId === 'agent-1');
    expect(row?.closedCount).toBe(4);
    expect(row?.assignedCount).toBe(2);
    expect(row?.reviewCount).toBe(2);
    expect(row?.problemSolvedRate).toBe(1);
    expect(row?.activeCount).toBe(3);
  });

  it('scopes /me metrics to the JWT agent id', async () => {
    const { service } = build();
    const mine = await service.forAgent('agent-other', {
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
    });
    expect(mine.agentId).toBe('agent-other');
    expect(mine.activeCount).toBe(0);
  });
});
