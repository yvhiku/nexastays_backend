import { SupportAssignmentService } from './support-assignment.service';
import { StaysSupportTicket } from './entities/stays-support-ticket.entity';
import { SUPPORT_ROUTING_ADVISORY_LOCK } from './support-routing.config';

describe('SupportAssignmentService', () => {
  function ticketRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'ticket-1',
      assigned_admin_id: null,
      priority: 'NORMAL',
      status: 'OPEN',
      updated_at: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  function buildService(options?: {
    ticket?: Record<string, unknown>;
    roster?: { id: string; status: string; staff_role: string }[];
    workloads?: {
      agentId: string;
      assigned: number;
      inProgress: number;
      waiting: number;
      atRisk: number;
      breached: number;
    }[];
    authzById?: Record<
      string,
      {
        authz_version: number;
        status: string;
        account_type: string;
        staff_role: string;
      } | null
    >;
    liveWorkloads?: () => {
      agentId: string;
      assigned: number;
      inProgress: number;
      waiting: number;
      atRisk: number;
      breached: number;
    }[];
  }) {
    const stored = options?.ticket ?? ticketRow();
    const ticketQb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => ({ ...stored })),
    };
    const ticketRepo = {
      createQueryBuilder: jest.fn(() => ticketQb),
      save: jest.fn(async (row: Record<string, unknown>) => {
        Object.assign(stored, row);
        return { ...stored };
      }),
    };
    const manager = {
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === StaysSupportTicket) return ticketRepo;
        return ticketRepo;
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (fn: (m: typeof manager) => unknown) =>
        fn(manager),
      ),
    };
    const identityUsers = {
      listActiveSupportAgents: jest.fn().mockResolvedValue(
        options?.roster ?? [
          { id: 'agent-a', status: 'ACTIVE', staff_role: 'SUPPORT_AGENT' },
          { id: 'agent-b', status: 'ACTIVE', staff_role: 'SUPPORT_AGENT' },
          { id: 'agent-c', status: 'ACTIVE', staff_role: 'SUPPORT_AGENT' },
        ],
      ),
      getAuthz: jest.fn(async (id: string) => {
        if (options?.authzById && id in options.authzById) {
          return options.authzById[id];
        }
        return {
          authz_version: 1,
          status: 'ACTIVE',
          account_type: 'ADMIN',
          staff_role: 'SUPPORT_AGENT',
        };
      }),
    };
    const staysAudit = { log: jest.fn().mockResolvedValue(undefined) };
    const ops = {
      queryAssignedAgentWorkload: jest.fn(async () => {
        if (options?.liveWorkloads) return options.liveWorkloads();
        return (
          options?.workloads ?? [
            {
              agentId: 'agent-a',
              assigned: 4,
              inProgress: 2,
              waiting: 1,
              atRisk: 0,
              breached: 0,
            },
            {
              agentId: 'agent-b',
              assigned: 3,
              inProgress: 1,
              waiting: 2,
              atRisk: 1,
              breached: 0,
            },
            {
              agentId: 'agent-c',
              assigned: 5,
              inProgress: 1,
              waiting: 0,
              atRisk: 0,
              breached: 0,
            },
          ]
        );
      }),
      safeEvaluate: jest.fn(async (fn: () => Promise<unknown>) => {
        try {
          await fn();
        } catch {
          /* fail-soft */
        }
      }),
      evaluateTicket: jest.fn().mockResolvedValue(undefined),
    };

    const service = new SupportAssignmentService(
      dataSource as never,
      identityUsers as never,
      staysAudit as never,
      ops as never,
    );

    return {
      service,
      stored,
      ticketRepo,
      manager,
      dataSource,
      identityUsers,
      staysAudit,
      ops,
    };
  }

  const originalAuto = process.env.SUPPORT_AUTO_ASSIGN;

  afterEach(() => {
    if (originalAuto === undefined) delete process.env.SUPPORT_AUTO_ASSIGN;
    else process.env.SUPPORT_AUTO_ASSIGN = originalAuto;
  });

  it('assigns the lowest-score eligible agent and audits source AUTO', async () => {
    const { service, stored, staysAudit, manager, ops } = buildService();

    await service.attemptAutoAssignment('ticket-1');

    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock($1)',
      [SUPPORT_ROUTING_ADVISORY_LOCK],
    );
    expect(stored.assigned_admin_id).toBe('agent-c');
    expect(staysAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'support_ticket_assigned',
        metadata: expect.objectContaining({
          fromAdminId: null,
          toAdminId: 'agent-c',
          source: 'AUTO',
        }),
      }),
    );
    expect(ops.evaluateTicket).toHaveBeenCalledWith('ticket-1');
  });

  it('skips assignment when the ticket is already assigned', async () => {
    const { service, ticketRepo, staysAudit } = buildService({
      ticket: ticketRow({ assigned_admin_id: 'agent-a' }),
    });

    await service.attemptAutoAssignment('ticket-1');

    expect(ticketRepo.save).not.toHaveBeenCalled();
    expect(staysAudit.log).not.toHaveBeenCalled();
  });

  it('leaves the ticket unassigned when Identity returns no eligible agents', async () => {
    const { service, ticketRepo, stored } = buildService({ roster: [] });

    await service.attemptAutoAssignment('ticket-1');

    expect(stored.assigned_admin_id).toBeNull();
    expect(ticketRepo.save).not.toHaveBeenCalled();
  });

  it('skips a frozen chosen agent and picks the next eligible one', async () => {
    const { service, stored } = buildService({
      authzById: {
        'agent-c': {
          authz_version: 1,
          status: 'FROZEN',
          account_type: 'ADMIN',
          staff_role: 'SUPPORT_AGENT',
        },
      },
    });

    await service.attemptAutoAssignment('ticket-1');

    expect(stored.assigned_admin_id).toBe('agent-a');
  });

  it('leaves the ticket unassigned when every agent is at capacity', async () => {
    const { service, stored, ticketRepo } = buildService({
      workloads: [
        {
          agentId: 'agent-a',
          assigned: 20,
          inProgress: 0,
          waiting: 0,
          atRisk: 0,
          breached: 0,
        },
        {
          agentId: 'agent-b',
          assigned: 20,
          inProgress: 0,
          waiting: 0,
          atRisk: 0,
          breached: 0,
        },
        {
          agentId: 'agent-c',
          assigned: 20,
          inProgress: 0,
          waiting: 0,
          atRisk: 0,
          breached: 0,
        },
      ],
    });

    await service.attemptAutoAssignment('ticket-1');

    expect(stored.assigned_admin_id).toBeNull();
    expect(ticketRepo.save).not.toHaveBeenCalled();
  });

  it('does not assign two concurrent tickets to the same agent from one snapshot', async () => {
    const counts: Record<string, number> = {
      'agent-a': 4,
      'agent-b': 3,
      'agent-c': 5,
    };
    const tickets = [
      ticketRow({ id: 'ticket-1' }),
      ticketRow({ id: 'ticket-2' }),
    ];
    let current = 0;
    const { service, identityUsers, staysAudit, ops } = buildService({
      liveWorkloads: () =>
        Object.entries(counts).map(([agentId, assigned]) => ({
          agentId,
          assigned,
          inProgress: agentId === 'agent-a' ? 2 : 1,
          waiting: agentId === 'agent-b' ? 2 : agentId === 'agent-a' ? 1 : 0,
          atRisk: agentId === 'agent-b' ? 1 : 0,
          breached: 0,
        })),
    });

    const ticketQb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => tickets[current]),
    };
    const ticketRepo = {
      createQueryBuilder: jest.fn(() => ticketQb),
      save: jest.fn(async (row: Record<string, unknown>) => {
        const assigned = String(row.assigned_admin_id);
        counts[assigned] = (counts[assigned] ?? 0) + 1;
        Object.assign(tickets[current], row);
        return { ...tickets[current] };
      }),
    };
    const manager = {
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn(() => ticketRepo),
    };
    const dataSource = {
      transaction: jest.fn(async (fn: (m: typeof manager) => unknown) =>
        fn(manager),
      ),
    };
    const sequential = new SupportAssignmentService(
      dataSource as never,
      identityUsers as never,
      staysAudit as never,
      ops as never,
    );

    await sequential.attemptAutoAssignment('ticket-1');
    expect(tickets[0].assigned_admin_id).toBe('agent-c');

    current = 1;
    await sequential.attemptAutoAssignment('ticket-2');
    expect(tickets[1].assigned_admin_id).not.toBe('agent-c');
    expect(tickets[1].assigned_admin_id).toBe('agent-a');
  });

  it('swallows assign errors so callers still succeed', async () => {
    const { service, identityUsers } = buildService();
    identityUsers.listActiveSupportAgents.mockRejectedValue(
      new Error('identity down'),
    );

    await expect(service.attemptAutoAssignment('ticket-1')).resolves.toBeUndefined();
  });

  it('no-ops when auto-assign is disabled', async () => {
    process.env.SUPPORT_AUTO_ASSIGN = 'false';
    const { service, identityUsers, ticketRepo } = buildService();

    await service.attemptAutoAssignment('ticket-1');

    expect(identityUsers.listActiveSupportAgents).not.toHaveBeenCalled();
    expect(ticketRepo.save).not.toHaveBeenCalled();
  });
});
