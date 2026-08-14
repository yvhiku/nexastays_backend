import { NotFoundException } from '@nestjs/common';
import { SupportTicketsService } from './support-tickets.service';
import { StaysConversation } from '../messaging/entities/stays-conversation.entity';
import { StaysSupportTicket } from './entities/stays-support-ticket.entity';

describe('Support assignment races', () => {
  const agentA = { userId: 'agent-a', role: 'SUPPORT_AGENT' as const };

  function ticketRow(overrides: Record<string, unknown> = {}) {
    const now = new Date('2026-01-01T00:00:00.000Z');
    return {
      id: 'ticket-1',
      ticket_number: 'SUP-2026-000001',
      subject: 'Help',
      category: 'OTHER',
      customer_name: null,
      party: 'GUEST',
      assigned_admin_id: null,
      status: 'OPEN',
      priority: 'NORMAL',
      created_at: now,
      updated_at: now,
      resolved_at: null,
      closed_at: null,
      first_admin_response_at: null,
      requester_user_id: 'guest-1',
      booking_id: null,
      listing_id: null,
      report_id: null,
      safety_issue_id: null,
      unread_for_support: false,
      last_message_preview: null,
      requester_email: null,
      conversation_id: 'conv-1',
      ...overrides,
    };
  }

  function buildService(stored: Record<string, unknown>) {
    const ticketQb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => ({ ...stored })),
    };
    const ticketRepo = {
      findOne: jest.fn(async () => ({ ...stored })),
      save: jest.fn(async (row: Record<string, unknown>) => {
        Object.assign(stored, row);
        return { ...stored };
      }),
      createQueryBuilder: jest.fn(() => ticketQb),
      update: jest.fn(),
    };
    const timelineSeeder = { insertMessage: jest.fn() };
    const staysAudit = { log: jest.fn().mockResolvedValue(undefined) };
    const identityUsers = {
      getAuthz: jest.fn().mockResolvedValue({
        authz_version: 1,
        status: 'ACTIVE',
        account_type: 'ADMIN',
        staff_role: 'SUPPORT_AGENT',
      }),
    };
    const ops = {
      safeEvaluate: jest.fn(async (fn: () => Promise<unknown>) => {
        try {
          await fn();
        } catch {
          /* fail-soft */
        }
      }),
      evaluateTicket: jest.fn().mockResolvedValue(undefined),
    };
    const unused = {};
    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === StaysSupportTicket) return ticketRepo;
        if (entity === StaysConversation) {
          return {
            findOne: jest.fn().mockResolvedValue({
              id: 'conv-1',
              unread_guest: 0,
              unread_host: 0,
              type: 'SUPPORT',
            }),
            update: jest.fn(),
          };
        }
        return { update: jest.fn() };
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (fn: (m: typeof manager) => unknown) =>
        fn(manager),
      ),
    };
    const service = new SupportTicketsService(
      dataSource as never,
      ticketRepo as never,
      unused as never,
      unused as never,
      unused as never,
      unused as never,
      unused as never,
      unused as never,
      unused as never,
      unused as never,
      unused as never,
      unused as never,
      unused as never,
      timelineSeeder as never,
      { publish: jest.fn() } as never,
      unused as never,
      identityUsers as never,
      staysAudit as never,
      ops as never,
    );
    return { service, ticketRepo, ticketQb, timelineSeeder, staysAudit, dataSource };
  }

  it('serializes two admin assignments so the last commit wins', async () => {
    const stored = ticketRow();
    const { service, staysAudit, ticketQb } = buildService(stored);

    const first = await service.patchForAdmin(
      'ticket-1',
      { assigned_admin_id: 'agent-a' },
      'admin-1',
    );
    const second = await service.patchForAdmin(
      'ticket-1',
      { assigned_admin_id: 'agent-b' },
      'admin-2',
    );

    expect(ticketQb.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(first.assigned_admin_id).toBe('agent-a');
    expect(second.assigned_admin_id).toBe('agent-b');
    expect(stored.assigned_admin_id).toBe('agent-b');
    expect(staysAudit.log).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        actorUserId: 'admin-1',
        action: 'support_ticket_assigned',
        metadata: { fromAdminId: null, toAdminId: 'agent-a' },
      }),
    );
    expect(staysAudit.log).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        actorUserId: 'admin-2',
        action: 'support_ticket_assigned',
        metadata: { fromAdminId: 'agent-a', toAdminId: 'agent-b' },
      }),
    );
  });

  it('rejects an agent message after the committed assignee changed', async () => {
    const stored = ticketRow({ assigned_admin_id: 'agent-b' });
    const { service, timelineSeeder } = buildService(stored);
    await expect(
      service.sendAdminMessage('ticket-1', 'agent-a', 'Hello', agentA),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(timelineSeeder.insertMessage).not.toHaveBeenCalled();
    expect(stored.assigned_admin_id).toBe('agent-b');
  });

  it('rejects an agent message after unassign', async () => {
    const stored = ticketRow({ assigned_admin_id: null });
    const { service, timelineSeeder } = buildService(stored);
    await expect(
      service.sendAdminMessage('ticket-1', 'agent-a', 'Hello', agentA),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(timelineSeeder.insertMessage).not.toHaveBeenCalled();
  });

  it('does not restore a stale assignee when status loses the assignment race', async () => {
    const stored = ticketRow({ assigned_admin_id: 'agent-b', status: 'OPEN' });
    const { service, ticketRepo } = buildService(stored);
    await expect(
      service.patchForAdmin(
        'ticket-1',
        { status: 'IN_PROGRESS' },
        'agent-a',
        agentA,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(stored.assigned_admin_id).toBe('agent-b');
    expect(stored.status).toBe('OPEN');
    expect(ticketRepo.save).not.toHaveBeenCalled();
  });
});
