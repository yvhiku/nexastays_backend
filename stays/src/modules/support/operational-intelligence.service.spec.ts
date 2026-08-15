import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { OperationalIntelligenceService } from './operational-intelligence.service';
import { signalDedupeKey } from './operational-signals.constants';
import { StaysSupportTicket } from './entities/stays-support-ticket.entity';

function hoursAgo(hours: number, now: Date) {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

function ticket(overrides: Partial<StaysSupportTicket> = {}): StaysSupportTicket {
  const now = new Date('2026-08-14T12:00:00.000Z');
  return {
    id: 'ticket-1',
    ticket_number: 'SUP-2026-000001',
    requester_user_id: 'guest-1',
    party: 'GUEST',
    category: 'OTHER',
    subject: 'Help',
    status: 'OPEN',
    priority: 'NORMAL',
    assigned_admin_id: null,
    conversation_id: 'conv-1',
    booking_id: null,
    listing_id: null,
    report_id: null,
    safety_issue_id: null,
    unread_for_support: true,
    last_message_preview: null,
    customer_name: 'Ada',
    requester_email: 'ada@example.com',
    resolved_at: null,
    first_admin_response_at: null,
    closed_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  } as StaysSupportTicket;
}

describe('OperationalIntelligenceService', () => {
  function build() {
    const saved: unknown[] = [];
    const signalRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((row: unknown) => row),
      save: jest.fn(async (rows: unknown) => {
        const list = Array.isArray(rows) ? rows : [rows];
        saved.push(...list);
        return rows;
      }),
      createQueryBuilder: jest.fn(() => {
        const qb = {
          andWhere: jest.fn().mockReturnThis(),
          innerJoin: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          take: jest.fn().mockReturnThis(),
          clone: jest.fn(),
          getCount: jest.fn().mockResolvedValue(0),
          getMany: jest.fn().mockResolvedValue([]),
        };
        qb.clone.mockReturnValue(qb);
        return qb;
      }),
    };
    const ticketRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    };
    const reportRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };
    const safetyRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };
    const csatRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };
    const staysAudit = { log: jest.fn().mockResolvedValue(undefined) };
    const dataSource = { query: jest.fn().mockResolvedValue([{}]) };

    const service = new OperationalIntelligenceService(
      dataSource as never,
      signalRepo as never,
      ticketRepo as never,
      reportRepo as never,
      safetyRepo as never,
      csatRepo as never,
      staysAudit as never,
    );
    return {
      service,
      signalRepo,
      ticketRepo,
      reportRepo,
      safetyRepo,
      csatRepo,
      staysAudit,
      saved,
      dataSource,
    };
  }

  describe('repeat reports', () => {
    it('does not signal for 2 reports', async () => {
      const { service, reportRepo, saved } = build();
      reportRepo.find.mockResolvedValue([
        { id: 'r1', reported_user_id: 'host-1' },
        { id: 'r2', reported_user_id: 'host-1' },
      ]);
      await service.evaluateRepeatReports('host-1');
      expect(saved).toHaveLength(0);
    });

    it('signals MEDIUM for 3 reports in 7 days', async () => {
      const { service, reportRepo, ticketRepo, saved } = build();
      reportRepo.find.mockResolvedValue([
        { id: 'r1', reported_user_id: 'host-1' },
        { id: 'r2', reported_user_id: 'host-1' },
        { id: 'r3', reported_user_id: 'host-1' },
      ]);
      ticketRepo.findOne.mockResolvedValue(ticket({ id: 't1', report_id: 'r1' }));
      await service.evaluateRepeatReports('host-1');
      expect(saved).toHaveLength(1);
      expect(saved[0]).toEqual(
        expect.objectContaining({
          signal_type: 'REPEAT_REPORT',
          severity: 'MEDIUM',
          status: 'ACTIVE',
          dedupe_key: signalDedupeKey('REPEAT_REPORT', 'USER', 'host-1'),
        }),
      );
    });

    it('signals HIGH for 5+ reports', async () => {
      const { service, reportRepo, saved } = build();
      reportRepo.find.mockResolvedValue(
        Array.from({ length: 5 }, (_, i) => ({ id: `r${i}` })),
      );
      await service.evaluateRepeatReports('host-1');
      expect(saved[0]).toEqual(expect.objectContaining({ severity: 'HIGH' }));
    });

    it('resolves existing signal when count drops below threshold', async () => {
      const { service, reportRepo, signalRepo, saved } = build();
      reportRepo.find.mockResolvedValue([{ id: 'r1' }]);
      signalRepo.find.mockResolvedValue([
        {
          dedupe_key: signalDedupeKey('REPEAT_REPORT', 'USER', 'host-1'),
          status: 'ACTIVE',
        },
      ]);
      await service.evaluateRepeatReports('host-1');
      expect(saved[0]).toEqual(
        expect.objectContaining({ status: 'RESOLVED' }),
      );
    });
  });

  describe('repeat safety', () => {
    it('does not signal for 1 issue', async () => {
      const { service, safetyRepo, saved } = build();
      safetyRepo.find.mockResolvedValue([{ id: 's1', category: 'OTHER' }]);
      await service.evaluateRepeatSafety('host-1');
      expect(saved).toHaveLength(0);
    });

    it('signals HIGH for 2 issues', async () => {
      const { service, safetyRepo, saved } = build();
      safetyRepo.find.mockResolvedValue([
        { id: 's1', category: 'OTHER' },
        { id: 's2', category: 'PROPERTY_PROBLEM' },
      ]);
      await service.evaluateRepeatSafety('host-1');
      expect(saved[0]).toEqual(
        expect.objectContaining({
          signal_type: 'REPEAT_SAFETY_REPORT',
          severity: 'HIGH',
        }),
      );
    });

    it('signals URGENT for severe explicit category', async () => {
      const { service, safetyRepo, saved } = build();
      safetyRepo.find.mockResolvedValue([
        { id: 's1', category: 'THREATS_HARASSMENT' },
        { id: 's2', category: 'OTHER' },
      ]);
      await service.evaluateRepeatSafety('host-1');
      expect(saved[0]).toEqual(expect.objectContaining({ severity: 'URGENT' }));
    });
  });

  describe('SLA', () => {
    const now = new Date('2026-08-14T12:00:00.000Z');

    it('ON_TRACK does not create SLA signals', async () => {
      const { service, saved } = build();
      await service.evaluateListedTickets(
        [ticket({ created_at: hoursAgo(1, now), priority: 'NORMAL' })],
        now,
      );
      expect(saved).toHaveLength(0);
    });

    it('AT_RISK produces SLA_ATTENTION', async () => {
      const { service, saved } = build();
      await service.evaluateListedTickets(
        [ticket({ created_at: hoursAgo(10, now), priority: 'NORMAL' })],
        now,
      );
      expect(saved).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ signal_type: 'SLA_ATTENTION', status: 'ACTIVE' }),
        ]),
      );
    });

    it('BREACHED produces SLA_BREACHED and resolves attention when not at risk', async () => {
      const { service, saved } = build();
      await service.evaluateListedTickets(
        [ticket({ created_at: hoursAgo(13, now), priority: 'NORMAL' })],
        now,
      );
      expect(saved).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ signal_type: 'SLA_BREACHED', status: 'ACTIVE' }),
        ]),
      );
      expect(saved.some((s: { signal_type?: string }) => s.signal_type === 'SLA_ATTENTION')).toBe(
        false,
      );
    });
  });

  describe('unassigned high priority', () => {
    const now = new Date('2026-08-14T12:00:00.000Z');

    it('HIGH unassigned → signal', async () => {
      const { service, saved } = build();
      await service.evaluateListedTickets(
        [ticket({ priority: 'HIGH', assigned_admin_id: null })],
        now,
      );
      expect(saved).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            signal_type: 'UNASSIGNED_HIGH_PRIORITY',
            severity: 'HIGH',
          }),
        ]),
      );
    });

    it('URGENT unassigned → signal', async () => {
      const { service, saved } = build();
      await service.evaluateListedTickets(
        [ticket({ priority: 'URGENT', assigned_admin_id: null, created_at: now })],
        now,
      );
      expect(saved).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            signal_type: 'UNASSIGNED_HIGH_PRIORITY',
            severity: 'URGENT',
          }),
        ]),
      );
    });

    it('LOW unassigned → no unassigned signal', async () => {
      const { service, saved } = build();
      await service.evaluateListedTickets(
        [ticket({ priority: 'LOW', assigned_admin_id: null, created_at: now })],
        now,
      );
      expect(
        saved.some(
          (s: { signal_type?: string }) => s.signal_type === 'UNASSIGNED_HIGH_PRIORITY',
        ),
      ).toBe(false);
    });

    it('assigned HIGH resolves the signal', async () => {
      const { service, signalRepo, saved } = build();
      signalRepo.find.mockResolvedValue([
        {
          dedupe_key: signalDedupeKey('UNASSIGNED_HIGH_PRIORITY', 'TICKET', 'ticket-1'),
          status: 'ACTIVE',
          signal_type: 'UNASSIGNED_HIGH_PRIORITY',
        },
      ]);
      await service.evaluateListedTickets(
        [ticket({ priority: 'HIGH', assigned_admin_id: 'admin-1', created_at: now })],
        now,
      );
      expect(saved).toEqual(
        expect.arrayContaining([expect.objectContaining({ status: 'RESOLVED' })]),
      );
    });

    it('CLOSED does not keep an active unassigned signal', async () => {
      const { service, signalRepo, saved } = build();
      signalRepo.find.mockResolvedValue([
        {
          dedupe_key: signalDedupeKey('UNASSIGNED_HIGH_PRIORITY', 'TICKET', 'ticket-1'),
          status: 'ACTIVE',
        },
      ]);
      await service.evaluateListedTickets(
        [
          ticket({
            priority: 'HIGH',
            status: 'CLOSED',
            assigned_admin_id: null,
            created_at: now,
          }),
        ],
        now,
      );
      expect(saved).toEqual(
        expect.arrayContaining([expect.objectContaining({ status: 'RESOLVED' })]),
      );
    });
  });

  describe('multiple open tickets', () => {
    it('3 open tickets → LOW signal', async () => {
      const { service, ticketRepo, saved } = build();
      ticketRepo.findOne.mockResolvedValue(ticket({ id: 'ticket-1' }));
      ticketRepo.count.mockResolvedValue(3);
      await service.evaluateTicket('ticket-1');
      expect(saved).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            signal_type: 'MULTIPLE_OPEN_TICKETS',
            severity: 'LOW',
          }),
        ]),
      );
    });

    it('2 open tickets resolves the signal', async () => {
      const { service, ticketRepo, signalRepo, saved } = build();
      ticketRepo.findOne.mockResolvedValue(ticket({ id: 'ticket-1' }));
      ticketRepo.count.mockResolvedValue(2);
      signalRepo.find.mockResolvedValue([
        {
          dedupe_key: signalDedupeKey('MULTIPLE_OPEN_TICKETS', 'USER', 'guest-1'),
          status: 'ACTIVE',
        },
      ]);
      await service.evaluateTicket('ticket-1');
      expect(saved).toEqual(
        expect.arrayContaining([expect.objectContaining({ status: 'RESOLVED' })]),
      );
    });
  });

  describe('related tickets', () => {
    it('matches same booking, excludes self, and limits', async () => {
      const { service, ticketRepo } = build();
      const current = ticket({
        id: 'ticket-1',
        booking_id: 'booking-1',
        requester_user_id: 'guest-1',
      });
      ticketRepo.findOne.mockResolvedValue(current);
      ticketRepo.find.mockImplementation(async (opts: { where?: Record<string, unknown> }) => {
        const where = opts?.where ?? {};
        if (where.booking_id === 'booking-1') {
          return [
            current,
            ticket({ id: 'ticket-2', ticket_number: 'SUP-2026-000002', booking_id: 'booking-1' }),
          ];
        }
        if (where.requester_user_id === 'guest-1') {
          return [
            current,
            ticket({ id: 'ticket-3', ticket_number: 'SUP-2026-000003' }),
          ];
        }
        return [];
      });
      const related = await service.findRelatedTickets('ticket-1');
      expect(related.find((r) => r.id === 'ticket-1')).toBeUndefined();
      expect(related.find((r) => r.id === 'ticket-2')?.relationship).toBe('SAME_BOOKING');
      expect(related).toHaveLength(2);
    });

    it('allows agent parent ownership and 404s foreign parent', async () => {
      const { service, ticketRepo } = build();
      const agentA = { userId: 'agent-a', role: 'SUPPORT_AGENT' as const };
      ticketRepo.findOne.mockResolvedValue(
        ticket({ id: 'ticket-1', assigned_admin_id: 'agent-a', booking_id: null }),
      );
      ticketRepo.find.mockResolvedValue([]);
      await expect(
        service.findRelatedTickets('ticket-1', agentA),
      ).resolves.toEqual([]);

      ticketRepo.findOne.mockResolvedValue(
        ticket({ id: 'ticket-b', assigned_admin_id: 'agent-b' }),
      );
      await expect(
        service.findRelatedTickets('ticket-b', agentA),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('omits foreign sibling tickets from an agent related list', async () => {
      const { service, ticketRepo } = build();
      const agentA = { userId: 'agent-a', role: 'SUPPORT_AGENT' as const };
      const parent = ticket({
        id: 'ticket-1',
        assigned_admin_id: 'agent-a',
        booking_id: 'booking-1',
        requester_user_id: 'guest-1',
      });
      ticketRepo.findOne.mockResolvedValue(parent);
      ticketRepo.find.mockImplementation(async (opts: { where?: Record<string, unknown> }) => {
        const where = opts?.where ?? {};
        if (where.booking_id === 'booking-1') {
          return [
            parent,
            ticket({
              id: 'ticket-own',
              ticket_number: 'SUP-2026-000010',
              booking_id: 'booking-1',
              assigned_admin_id: 'agent-a',
            }),
            ticket({
              id: 'ticket-foreign',
              ticket_number: 'SUP-2026-000011',
              booking_id: 'booking-1',
              assigned_admin_id: 'agent-b',
            }),
          ];
        }
        return [];
      });
      const related = await service.findRelatedTickets('ticket-1', agentA);
      expect(related.map((row) => row.id)).toEqual(['ticket-own']);
    });

    it('ticket-scoped signals follow parent ownership', async () => {
      const { service, ticketRepo, signalRepo } = build();
      const agentA = { userId: 'agent-a', role: 'SUPPORT_AGENT' as const };
      ticketRepo.findOne.mockResolvedValue(
        ticket({ id: 'ticket-1', assigned_admin_id: 'agent-a' }),
      );
      signalRepo.find.mockResolvedValue([]);
      await expect(
        service.listSignalsForTicket('ticket-1', false, agentA),
      ).resolves.toEqual({ items: [] });

      ticketRepo.findOne.mockResolvedValue(
        ticket({ id: 'ticket-b', assigned_admin_id: 'agent-b' }),
      );
      await expect(
        service.listSignalsForTicket('ticket-b', false, agentA),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('dedupe', () => {
    it('second evaluation updates last_detected_at on one row', async () => {
      const { service, reportRepo, signalRepo, saved } = build();
      reportRepo.find.mockResolvedValue([
        { id: 'r1' },
        { id: 'r2' },
        { id: 'r3' },
      ]);
      const existing = {
        id: 'sig-1',
        dedupe_key: signalDedupeKey('REPEAT_REPORT', 'USER', 'host-1'),
        status: 'ACTIVE',
        last_detected_at: new Date('2026-08-01T00:00:00.000Z'),
      };
      signalRepo.find.mockResolvedValue([existing]);
      await service.evaluateRepeatReports('host-1');
      expect(saved).toHaveLength(1);
      expect(saved[0]).toBe(existing);
      expect((saved[0] as { last_detected_at: Date }).last_detected_at.getTime()).toBeGreaterThan(
        new Date('2026-08-01T00:00:00.000Z').getTime(),
      );
    });

    it('reopens a RESOLVED signal when the condition is true again', async () => {
      const { service, reportRepo, signalRepo, saved } = build();
      reportRepo.find.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]);
      signalRepo.find.mockResolvedValue([
        {
          dedupe_key: signalDedupeKey('REPEAT_REPORT', 'USER', 'host-1'),
          status: 'RESOLVED',
        },
      ]);
      await service.evaluateRepeatReports('host-1');
      expect(saved[0]).toEqual(expect.objectContaining({ status: 'ACTIVE' }));
    });

    it('retries as an update after UNIQUE(dedupe_key) 23505', async () => {
      const { service, reportRepo, signalRepo, saved } = build();
      reportRepo.find.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]);
      const existing = {
        dedupe_key: signalDedupeKey('REPEAT_REPORT', 'USER', 'host-1'),
        status: 'ACTIVE',
      };
      signalRepo.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([existing]);
      const err = new QueryFailedError('INSERT', [], new Error('duplicate'));
      Object.assign(err, { driverError: { code: '23505' } });
      signalRepo.save.mockRejectedValueOnce(err);
      await service.evaluateRepeatReports('host-1');
      expect(saved).toHaveLength(1);
      expect(saved[0]).toBe(existing);
    });
  });

  describe('signal lifecycle API', () => {
    it('ACTIVE → ACKNOWLEDGED audits without bodies', async () => {
      const { service, signalRepo, staysAudit } = build();
      signalRepo.findOne.mockResolvedValue({
        id: 'sig-1',
        status: 'ACTIVE',
        ticket_id: 'ticket-1',
        signal_type: 'SLA_ATTENTION',
        metadata: { code: 'FIRST_RESPONSE_AT_RISK' },
        first_detected_at: new Date(),
        last_detected_at: new Date(),
      });
      await service.patchSignal('sig-1', 'ACKNOWLEDGED', 'admin-1');
      expect(staysAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'support_operational_signal_acknowledged',
          metadata: expect.objectContaining({
            signalId: 'sig-1',
            ticketId: 'ticket-1',
            fromStatus: 'ACTIVE',
            toStatus: 'ACKNOWLEDGED',
          }),
        }),
      );
      expect(staysAudit.log.mock.calls[0][0].metadata.body).toBeUndefined();
    });

    it('rejects invalid transition', async () => {
      const { service, signalRepo } = build();
      signalRepo.findOne.mockResolvedValue({ id: 'sig-1', status: 'RESOLVED' });
      await expect(
        service.patchSignal('sig-1', 'ACKNOWLEDGED', 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('unknown signal → 404', async () => {
      const { service, signalRepo } = build();
      signalRepo.findOne.mockResolvedValue(null);
      await expect(
        service.patchSignal('missing', 'ACKNOWLEDGED', 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('agent ACK on owned ticket; missing and foreign signals share Signal not found', async () => {
      const { service, signalRepo, ticketRepo, staysAudit } = build();
      const agentA = { userId: 'agent-a', role: 'SUPPORT_AGENT' as const };
      signalRepo.findOne.mockResolvedValue({
        id: 'sig-1',
        status: 'ACTIVE',
        ticket_id: 'ticket-1',
        signal_type: 'SLA_ATTENTION',
        metadata: { code: 'FIRST_RESPONSE_AT_RISK' },
        first_detected_at: new Date(),
        last_detected_at: new Date(),
      });
      ticketRepo.findOne.mockResolvedValue(
        ticket({ id: 'ticket-1', assigned_admin_id: 'agent-a' }),
      );
      await service.patchSignal('sig-1', 'ACKNOWLEDGED', 'agent-a', agentA);
      expect(staysAudit.log).toHaveBeenCalled();

      ticketRepo.findOne.mockResolvedValue(
        ticket({ id: 'ticket-1', assigned_admin_id: 'agent-b' }),
      );
      await expect(
        service.patchSignal('sig-1', 'ACKNOWLEDGED', 'agent-a', agentA),
      ).rejects.toMatchObject({ message: 'Signal not found' });

      signalRepo.findOne.mockResolvedValue({
        id: 'sig-2',
        status: 'ACTIVE',
        ticket_id: null,
      });
      await expect(
        service.patchSignal('sig-2', 'ACKNOWLEDGED', 'agent-a', agentA),
      ).rejects.toMatchObject({ message: 'Signal not found' });

      signalRepo.findOne.mockResolvedValue(null);
      await expect(
        service.patchSignal('missing', 'ACKNOWLEDGED', 'agent-a', agentA),
      ).rejects.toMatchObject({ message: 'Signal not found' });
    });
  });

  describe('FOLLOW_UP_REQUIRED', () => {
    it('upserts an active signal for unsolved CSAT and is race-safe', async () => {
      const { service, signalRepo, saved } = build();
      await service.upsertFollowUpRequired({
        ticketId: 'ticket-1',
        problemSolved: false,
        overallRating: 2,
        agentRating: 5,
      });
      expect(saved[0]).toEqual(
        expect.objectContaining({
          signal_type: 'FOLLOW_UP_REQUIRED',
          status: 'ACTIVE',
          severity: 'HIGH',
          dedupe_key: signalDedupeKey(
            'FOLLOW_UP_REQUIRED',
            'TICKET',
            'ticket-1',
          ),
          metadata: expect.objectContaining({
            code: 'CUSTOMER_REPORTED_UNRESOLVED',
            problemSolved: false,
            overallRating: 2,
            agentRating: 5,
          }),
        }),
      );

      const existing = {
        dedupe_key: signalDedupeKey('FOLLOW_UP_REQUIRED', 'TICKET', 'ticket-1'),
        status: 'ACTIVE',
        metadata: {},
      };
      signalRepo.find
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([existing]);
      const err = new QueryFailedError('INSERT', [], new Error('duplicate'));
      Object.assign(err, { driverError: { code: '23505' } });
      signalRepo.save.mockRejectedValueOnce(err);
      saved.length = 0;
      await service.upsertFollowUpRequired({
        ticketId: 'ticket-1',
        problemSolved: false,
        overallRating: 2,
        agentRating: 5,
      });
      expect(saved).toHaveLength(1);
      expect(saved[0]).toBe(existing);
    });

    it('does not reactivate a historically resolved follow-up', async () => {
      const { service, signalRepo, saved } = build();
      signalRepo.find.mockResolvedValue([
        {
          dedupe_key: signalDedupeKey('FOLLOW_UP_REQUIRED', 'TICKET', 'ticket-1'),
          status: 'RESOLVED',
          metadata: {},
        },
      ]);
      await service.upsertFollowUpRequired({
        ticketId: 'ticket-1',
        problemSolved: false,
        overallRating: 1,
        agentRating: 1,
      });
      expect(saved).toHaveLength(0);
      expect(signalRepo.save).not.toHaveBeenCalled();
    });

    it('resolves only the active follow-up row', async () => {
      const { service, signalRepo } = build();
      const active = {
        ticket_id: 'ticket-1',
        signal_type: 'FOLLOW_UP_REQUIRED',
        status: 'ACTIVE',
        metadata: { code: 'CUSTOMER_REPORTED_UNRESOLVED' },
      };
      signalRepo.findOne.mockResolvedValue(active);
      await service.resolveActiveFollowUpRequired('ticket-1', 'admin-1', 'REOPENED');
      expect(active.status).toBe('RESOLVED');
      expect(active.metadata).toEqual(
        expect.objectContaining({ resolution: 'REOPENED' }),
      );
      expect(signalRepo.save).toHaveBeenCalledWith(active);
    });

    it('rejects ACKNOWLEDGE on FOLLOW_UP_REQUIRED', async () => {
      const { service, signalRepo } = build();
      signalRepo.findOne.mockResolvedValue({
        id: 'sig-1',
        status: 'ACTIVE',
        signal_type: 'FOLLOW_UP_REQUIRED',
      });
      await expect(
        service.patchSignal('sig-1', 'ACKNOWLEDGED', 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('mark reviewed resolves follow-up with actor metadata', async () => {
      const { service, signalRepo } = build();
      const row = {
        id: 'sig-1',
        status: 'ACTIVE',
        ticket_id: 'ticket-1',
        signal_type: 'FOLLOW_UP_REQUIRED',
        metadata: { code: 'CUSTOMER_REPORTED_UNRESOLVED' },
        first_detected_at: new Date(),
        last_detected_at: new Date(),
      };
      signalRepo.findOne.mockResolvedValue(row);
      await service.patchSignal('sig-1', 'RESOLVED', 'admin-1');
      expect(row.status).toBe('RESOLVED');
      expect(row.metadata).toEqual(
        expect.objectContaining({ resolution: 'MARK_REVIEWED' }),
      );
    });
  });

  describe('low CSAT', () => {
    it('requires 5 responses and 2 low ratings', async () => {
      const { service, ticketRepo, csatRepo, saved } = build();
      csatRepo.find.mockResolvedValue([
        { ticket_id: 't1', rating: 2, agent_id: 'admin-1' },
        { ticket_id: 't2', rating: 1, agent_id: 'admin-1' },
      ]);
      await service.evaluateLowCsatPattern('admin-1');
      expect(ticketRepo.find).not.toHaveBeenCalled();
      expect(csatRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ agent_id: 'admin-1' }),
        }),
      );
      expect(saved).toHaveLength(0);

      csatRepo.find.mockResolvedValue([
        { rating: 1, agent_id: 'admin-1' },
        { rating: 2, agent_id: 'admin-1' },
        { rating: 5, agent_id: 'admin-1' },
        { rating: 5, agent_id: 'admin-1' },
        { rating: 4, agent_id: 'admin-1' },
      ]);
      await service.evaluateLowCsatPattern('admin-1');
      expect(saved[0]).toEqual(
        expect.objectContaining({ signal_type: 'LOW_CSAT_PATTERN', status: 'ACTIVE' }),
      );
    });
  });

  it('safeEvaluate swallows engine failures', async () => {
    const { service } = build();
    await expect(
      service.safeEvaluate(async () => {
        throw new Error('db down');
      }),
    ).resolves.toBeUndefined();
  });

  it('slaState filter SQL casts named hour params to int', () => {
    const { service } = build();
    const sql: string[] = [];
    service.applySlaStateFilter(
      {
        andWhere: (fragment: string) => {
          sql.push(fragment);
        },
      },
      't',
      'AT_RISK',
    );
    expect(sql.join(' ')).toContain('CAST(:slaFrLow AS int)');
    expect(sql.join(' ')).toContain('CAST(:slaResNormal AS int)');
    expect(sql.join(' ')).not.toMatch(/THEN :slaFrLow\s/);
  });

  it('lists agent workload without closed tickets or overview totals', async () => {
    const { service, dataSource } = build();
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('stays_support_ticket_csat')) {
        return [
          {
            agent_id: 'agent-1',
            review_count: 3,
            average_agent_rating: 4.5,
            r1: 0,
            r2: 0,
            r3: 0,
            r4: 1,
            r5: 2,
          },
        ];
      }
      return [
        {
          agent_id: 'agent-1',
          assigned: 4,
          open: 1,
          in_progress: 2,
          waiting: 1,
          high_priority: 3,
          at_risk: 1,
          breached: 0,
          oldest_active_ticket_at: '2026-08-01T00:00:00.000Z',
        },
      ];
    });
    const result = await service.listAgentWorkload(
      new Date('2026-08-14T12:00:00.000Z'),
    );
    expect(result.items).toEqual([
      {
        agentId: 'agent-1',
        assigned: 4,
        open: 1,
        inProgress: 2,
        waiting: 1,
        waitingForCustomer: 0,
        waitingForHost: 0,
        escalated: 0,
        atRisk: 1,
        breached: 0,
        oldestActiveTicketAt: '2026-08-01T00:00:00.000Z',
        reviewCount: 3,
        averageAgentRating: 4.5,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 2 },
      },
    ]);
    expect(result.generatedAt).toBe('2026-08-14T12:00:00.000Z');
    expect(dataSource.query.mock.calls[0][0]).toContain('assigned_admin_id');
    expect(dataSource.query.mock.calls[1][0]).toContain(
      'stays_support_ticket_csat',
    );
    expect(JSON.stringify(result)).not.toContain('highPriority');
  });

  it('returns queue health splits and on-track SLA from overview SQL', async () => {
    const { service, dataSource } = build();
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('open_tickets')) {
        return [
          {
            active_tickets: 5,
            open_tickets: 2,
            in_progress_tickets: 1,
            waiting_tickets: 1,
            escalated_tickets: 1,
            unassigned_tickets: 2,
            high_priority_tickets: 3,
            high_priority_unassigned: 1,
            urgent_tickets: 1,
            sla_on_track: 3,
            sla_at_risk: 1,
            sla_breached: 1,
          },
        ];
      }
      if (sql.includes('active_signals')) {
        return [{ active_signals: 2, acknowledged_signals: 1 }];
      }
      return [];
    });
    const overview = await service.getOperationsOverview(
      new Date('2026-08-14T12:00:00.000Z'),
    );
    expect(overview.openTickets).toBe(2);
    expect(overview.inProgressTickets).toBe(1);
    expect(overview.waitingTickets).toBe(1);
    expect(overview.unassignedTickets).toBe(2);
    expect(overview.slaOnTrack).toBe(3);
    expect(overview.slaAtRisk).toBe(1);
    expect(overview.slaBreached).toBe(1);
    expect(overview.generatedAt).toBe('2026-08-14T12:00:00.000Z');
  });

  it('lists attention tickets once with union reasons', async () => {
    const { service, dataSource } = build();
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)::int AS total')) {
        return [{ total: 1 }];
      }
      return [
        {
          id: 'ticket-1',
          ticket_number: 'SUP-2026-000001',
          subject: 'Help',
          status: 'OPEN',
          priority: 'URGENT',
          assigned_admin_id: null,
          created_at: '2026-08-01T00:00:00.000Z',
          sla_state: 'BREACHED',
          has_active_signal: true,
          has_follow_up: false,
          overall_rating: null,
          agent_rating: null,
          problem_solved: null,
        },
      ];
    });
    const page = await service.listAttention({ limit: 80, offset: 0 });
    expect(page.limit).toBe(50);
    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].ticketId).toBe('ticket-1');
    expect(page.items[0].attentionReasons).toEqual([
      'SLA_BREACHED',
      'URGENT',
      'UNASSIGNED',
      'ACTIVE_SIGNAL',
    ]);
    expect(dataSource.query.mock.calls[0][0]).toContain(
      "'OPEN','IN_PROGRESS','WAITING_FOR_CUSTOMER','WAITING_FOR_HOST','ESCALATED'",
    );
    expect(dataSource.query.mock.calls[1][0]).toContain('FOLLOW_UP_REQUIRED');
  });

  it('includes CLOSED tickets with an active follow-up signal and CSAT ratings', async () => {
    const { service, dataSource } = build();
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)::int AS total')) {
        return [{ total: 1 }];
      }
      return [
        {
          id: 'ticket-closed',
          ticket_number: 'SUP-2026-000002',
          subject: 'Payment',
          status: 'CLOSED',
          priority: 'NORMAL',
          assigned_admin_id: 'agent-a',
          created_at: '2026-08-01T00:00:00.000Z',
          sla_state: 'ON_TRACK',
          has_active_signal: true,
          has_follow_up: true,
          follow_up_signal_id: 'sig-1',
          overall_rating: 2,
          agent_rating: 4,
          problem_solved: false,
        },
      ];
    });
    const page = await service.listAttention({ limit: 20, offset: 0 });
    expect(page.items[0]).toEqual(
      expect.objectContaining({
        ticketId: 'ticket-closed',
        attentionReasons: ['FOLLOW_UP_REQUIRED'],
        overallRating: 2,
        agentRating: 4,
        problemSolved: false,
      }),
    );
  });
});
