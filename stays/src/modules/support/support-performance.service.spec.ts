import { SupportPerformanceService } from './support-performance.service';

describe('SupportPerformanceService', () => {
  function build() {
    const dataSource = {
      query: jest.fn().mockResolvedValue([]),
    };
    const ops = {
      queryAssignedAgentWorkload: jest.fn().mockResolvedValue([
        {
          agentId: 'agent-b',
          assigned: 2,
          inProgress: 1,
          waitingForCustomer: 0,
          waitingForHost: 0,
          escalated: 0,
        },
      ]),
    };
    const service = new SupportPerformanceService(
      dataSource as never,
      ops as never,
    );
    return { service, dataSource, ops };
  }

  it('attributes first-response SLA to the first responder, not the closer', async () => {
    const { service, dataSource } = build();
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('first_sender.sender_id')) {
        return [
          {
            agent_id: 'agent-a',
            sample_count: 1,
            sla_met: 1,
            sla_breached: 0,
            avg_seconds: 60,
          },
        ];
      }
      if (sql.includes('t.review_agent_id') && sql.includes('tickets_closed')) {
        return [
          {
            agent_id: 'agent-b',
            tickets_closed: 1,
            tickets_reopened: 0,
            matured_closed: 1,
            matured_reopened: 0,
          },
        ];
      }
      if (sql.includes('stays_support_ticket_csat') && sql.includes('agent_id')) {
        return [
          {
            agent_id: 'agent-b',
            review_count: 1,
            average_overall_rating: 4,
            average_agent_rating: 5,
            solved_count: 1,
            unsolved_count: 0,
            r1: 0,
            r2: 0,
            r3: 0,
            r4: 0,
            r5: 1,
          },
        ];
      }
      return [];
    });
    const window = service.parseWindow({
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
    });
    const items = await service.listAgentPerformance(window);
    const a = items.find((row) => row.agentId === 'agent-a');
    const b = items.find((row) => row.agentId === 'agent-b');
    expect(a?.firstResponseSlaMet).toBe(1);
    expect(a?.ticketsClosed).toBe(0);
    expect(b?.ticketsClosed).toBe(1);
    expect(b?.reviewCount).toBe(1);
    expect(b?.firstResponseCount).toBe(0);
    expect(
      dataSource.query.mock.calls.some(
        (call: [string]) =>
          call[0].includes('stays_support_ticket_csat') &&
          call[0].includes('assigned_admin_id'),
      ),
    ).toBe(false);
  });

  it('cohorts reopen rate by close date, not reopen-event date', async () => {
    const { service, dataSource } = build();
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('tickets_closed')) {
        expect(sql).toContain('t.closed_at >= $1');
        expect(sql).not.toMatch(
          /action = 'support_ticket_reopened'[\s\S]*created_at >= \$1/,
        );
        return [
          {
            agent_id: 'agent-b',
            tickets_closed: 4,
            tickets_reopened: 1,
            matured_closed: 3,
            matured_reopened: 1,
          },
        ];
      }
      return [];
    });
    const window = service.parseWindow({
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
    });
    const row = await service.forAgent('agent-b', window);
    expect(row.ticketsClosed).toBe(4);
    expect(row.ticketsReopened).toBe(1);
    expect(row.reopenRate).toBe(0.25);
    expect(row.maturedReopenRate).toBeCloseTo(1 / 3);
  });

  it('does not treat missing reviews as unsolved', async () => {
    const { service } = build();
    const window = service.parseWindow({
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
    });
    const mine = await service.forAgent('agent-x', window);
    expect(mine.reviewCount).toBe(0);
    expect(mine.problemSolvedRate).toBeNull();
  });
});
