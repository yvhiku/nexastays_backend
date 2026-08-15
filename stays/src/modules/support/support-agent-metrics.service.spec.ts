import { SupportAgentMetricsService } from './support-agent-metrics.service';

describe('SupportAgentMetricsService', () => {
  function build() {
    const dataSource = {
      query: jest.fn().mockResolvedValue([]),
    };
    const ops = {
      queryAssignedAgentWorkload: jest.fn().mockResolvedValue([
        {
          agentId: 'agent-1',
          assigned: 3,
          open: 1,
          inProgress: 1,
          waiting: 1,
          waitingForCustomer: 1,
          waitingForHost: 0,
          escalated: 0,
          highPriority: 0,
          atRisk: 0,
          breached: 0,
          oldestActiveTicketAt: null,
        },
      ]),
    };
    const service = new SupportAgentMetricsService(
      dataSource as never,
      ops as never,
    );
    return { service, dataSource, ops };
  }

  it('does not use live assigned_admin_id for CSAT or closed counts', async () => {
    const { service, dataSource } = build();
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes("action = 'support_ticket_assigned'")) {
        return [{ agent_id: 'agent-1', assigned_count: 2 }];
      }
      if (sql.includes('closed_at') && sql.includes('review_agent_id')) {
        return [{ agent_id: 'agent-1', closed_count: 4 }];
      }
      if (sql.includes('stays_support_ticket_csat')) {
        return [
          {
            agent_id: 'agent-1',
            review_count: 2,
            average_overall_rating: 4,
            average_agent_rating: 5,
            solved_count: 2,
          },
        ];
      }
      return [];
    });
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
    expect(
      dataSource.query.mock.calls.some(
        (call: [string]) =>
          call[0].includes('stays_support_ticket_csat') &&
          call[0].includes('assigned_admin_id'),
      ),
    ).toBe(false);
  });

  it('does not treat missing reviews as unsolved', async () => {
    const { service, dataSource } = build();
    dataSource.query.mockResolvedValue([]);
    const mine = await service.forAgent('agent-1', {
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
    });
    expect(mine.reviewCount).toBe(0);
    expect(mine.problemSolvedRate).toBeNull();
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

  it('omits trends unless both periods have sample >= 5 for that metric', async () => {
    const { service, dataSource } = build();
    let call = 0;
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('stays_support_ticket_csat')) {
        call += 1;
        return [
          {
            agent_id: 'agent-1',
            review_count: call === 1 ? 6 : 2,
            average_overall_rating: 4,
            average_agent_rating: 5,
            solved_count: call === 1 ? 6 : 2,
          },
        ];
      }
      return [];
    });
    const listed = await service.listForAdmin({
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
    });
    const row = listed.items.find((item) => item.agentId === 'agent-1');
    expect(row?.trends).toBeNull();
  });
});
