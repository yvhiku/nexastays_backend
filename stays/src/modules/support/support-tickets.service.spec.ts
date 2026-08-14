import { BadRequestException, ConflictException, ForbiddenException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SupportTicketsService } from './support-tickets.service';
import { StaysConversation } from '../messaging/entities/stays-conversation.entity';
import { StaysSupportTicket } from './entities/stays-support-ticket.entity';
import { StaysSupportTicketNote } from './entities/stays-support-ticket-note.entity';
import { StaysConversationReport } from './entities/stays-conversation-report.entity';
import { StaysSafetyIssue } from './entities/stays-safety-issue.entity';
import { StaysBooking } from '../stays/entities/stays-booking.entity';
import { StaysListing } from '../stays/entities/stays-listing.entity';
import { PatchTrustReportDto } from './dto/support-ticket.dto';
import { CLOSED_SUPPORT_TICKET_MESSAGE } from './support-ticket-state';

describe('SupportTicketsService', () => {
  function uniqueViolation() {
    const err = new QueryFailedError('INSERT', [], new Error('duplicate'));
    Object.assign(err, { driverError: { code: '23505' } });
    return err;
  }

  function buildService() {
    const ticketQb = {
      leftJoin: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      clone: jest.fn(),
      getCount: jest.fn().mockResolvedValue(0),
      getMany: jest.fn().mockResolvedValue([]),
      setLock: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };
    ticketQb.clone.mockReturnValue(ticketQb);

    const ticketRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((row: unknown) => row),
      save: jest.fn(async (row: Record<string, unknown>) => ({
        ...row,
        id: (row.id as string) ?? 'ticket-1',
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      })),
      update: jest.fn(),
      createQueryBuilder: jest.fn(() => ticketQb),
    };
    ticketQb.getOne.mockImplementation(async () => ticketRepo.findOne());
    const reportRepo = {
      create: jest.fn((row: unknown) => row),
      save: jest.fn(async (row: Record<string, unknown>) => ({
        ...row,
        id: (row.id as string) ?? 'report-1',
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
        attachment_ids: row.attachment_ids ?? [],
      })),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    const safetyRepo = {
      create: jest.fn((row: unknown) => row),
      save: jest.fn(async (row: Record<string, unknown>) => ({
        ...row,
        id: (row.id as string) ?? 'safety-1',
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
        attachment_ids: row.attachment_ids ?? [],
      })),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    const convRepo = {
      findOne: jest.fn(),
      create: jest.fn((row: unknown) => row),
      save: jest.fn(async (row: Record<string, unknown>) => ({
        ...row,
        id: 'conv-1',
      })),
      update: jest.fn(),
    };
    const messageRepo = { find: jest.fn().mockResolvedValue([]) };
    const attachmentRepo = { find: jest.fn().mockResolvedValue([]) };
    const bookingRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    const listingRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };
    const hostProfileRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const timelineSeeder = {
      insertMessage: jest.fn().mockResolvedValue({
        id: 'msg-1',
        sent_at: new Date(),
        created_at: new Date(),
      }),
    };
    const realtime = { publish: jest.fn() };
    const media = {
      resolveAttachment: jest.fn().mockReturnValue({ url: 'https://signed/img' }),
    };
    const identityUsers = {
      getProfileSummary: jest.fn().mockResolvedValue({
        fullName: 'Ada Guest',
        email: 'ada@example.com',
        verified: false,
      }),
      getAuthz: jest.fn().mockResolvedValue({
        authz_version: 1,
        status: 'ACTIVE',
        account_type: 'ADMIN',
        staff_role: 'SUPPORT_AGENT',
      }),
    };
    const staysAudit = { log: jest.fn().mockResolvedValue(undefined) };
    const ops = {
      safeEvaluate: jest.fn(async (fn: () => Promise<unknown>) => {
        try {
          await fn();
        } catch {
          /* fail-soft */
        }
      }),
      evaluateTicket: jest.fn().mockResolvedValue(undefined),
      evaluateReport: jest.fn().mockResolvedValue(undefined),
      evaluateListedTickets: jest.fn().mockResolvedValue(undefined),
      evaluateCsatForAdmin: jest.fn().mockResolvedValue(undefined),
      applySlaStateFilter: jest.fn(),
      activeTypesByTicketIds: jest.fn().mockResolvedValue(new Map()),
      listSignalsForTicket: jest.fn().mockResolvedValue({ items: [] }),
      findRelatedTickets: jest.fn().mockResolvedValue([]),
      listSignalsForReportedUser: jest.fn().mockResolvedValue({ items: [] }),
    };

    const manager = {
      query: jest.fn().mockImplementation(async (sql: string) => {
        if (typeof sql === 'string' && sql.includes('SAVEPOINT')) {
          return undefined;
        }
        if (typeof sql === 'string' && sql.includes('stays_support_ticket_ref_counters')) {
          if (sql.includes('INSERT')) return undefined;
          return [{ counter: '7' }];
        }
        return undefined;
      }),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === StaysConversation) return convRepo;
        if (entity === StaysSupportTicket) return ticketRepo;
        if (entity === StaysConversationReport) return reportRepo;
        if (entity === StaysSafetyIssue) return safetyRepo;
        if (entity === StaysBooking) return bookingRepo;
        if (entity === StaysListing) return listingRepo;
        if (entity === StaysSupportTicketNote) return noteRepo;
        return ticketRepo;
      }),
    };

    const dataSource = {
      transaction: jest.fn(async (fn: (m: typeof manager) => unknown) =>
        fn(manager),
      ),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('COUNT(*)')) return [{ total: 0 }];
        if (sql.includes('SELECT u.id')) return [];
        return [];
      }),
    };

    const noteRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((row: unknown) => row),
      save: jest.fn(async (row: Record<string, unknown>) => ({
        ...row,
        id: (row.id as string) ?? 'note-1',
        created_at: new Date('2026-01-01T00:00:00.000Z'),
      })),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    const csatRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((row: unknown) => row),
      save: jest.fn(async (row: Record<string, unknown>) => ({
        ...row,
        id: (row.id as string) ?? 'csat-1',
        submitted_at: new Date('2026-01-02T00:00:00.000Z'),
      })),
    };
    const auditLogRepo = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
        getMany: jest.fn().mockResolvedValue([]),
        clone: jest.fn().mockReturnThis(),
      })),
    };

    const assignment = {
      attemptAutoAssignment: jest.fn().mockResolvedValue(undefined),
    };

    const service = new SupportTicketsService(
      dataSource as never,
      ticketRepo as never,
      reportRepo as never,
      safetyRepo as never,
      convRepo as never,
      messageRepo as never,
      attachmentRepo as never,
      bookingRepo as never,
      listingRepo as never,
      hostProfileRepo as never,
      noteRepo as never,
      csatRepo as never,
      auditLogRepo as never,
      timelineSeeder as never,
      realtime as never,
      media as never,
      identityUsers as never,
      staysAudit as never,
      ops as never,
      assignment as never,
    );

    return {
      service,
      ticketRepo,
      ticketQb,
      reportRepo,
      safetyRepo,
      bookingRepo,
      listingRepo,
      attachmentRepo,
      timelineSeeder,
      realtime,
      dataSource,
      manager,
      convRepo,
      identityUsers,
      staysAudit,
      media,
      messageRepo,
      noteRepo,
      csatRepo,
      auditLogRepo,
      ops,
      assignment,
    };
  }

  it('creates ticket + SUPPORT conversation + first message transactionally', async () => {
    const { service, timelineSeeder, realtime, identityUsers } = buildService();

    const result = await service.createTicketForUser('guest-1', {
      category: 'BOOKING',
      subject: 'Help with booking',
      message: 'I need help',
    });

    expect(result.ticket_number).toMatch(/^SUP-\d{4}-000007$/);
    expect(result.conversation_id).toBe('conv-1');
    expect(timelineSeeder.insertMessage).toHaveBeenCalled();
    expect(identityUsers.getProfileSummary).toHaveBeenCalledWith('guest-1');
    expect(realtime.publish).toHaveBeenCalledWith(
      'guest-1',
      expect.objectContaining({ conversationId: 'conv-1' }),
    );
  });

  it('auto-assigns after a standalone ticket create commits', async () => {
    const { service, assignment } = buildService();

    const result = await service.createTicketForUser('guest-1', {
      category: 'BOOKING',
      subject: 'Help with booking',
      message: 'I need help',
    });

    expect(assignment.attemptAutoAssignment).toHaveBeenCalledWith(result.id);
  });

  it('still creates the ticket when auto-assign throws', async () => {
    const { service, assignment } = buildService();
    assignment.attemptAutoAssignment.mockRejectedValue(new Error('router down'));

    const result = await service.createTicketForUser('guest-1', {
      category: 'BOOKING',
      subject: 'Help with booking',
      message: 'I need help',
    });

    expect(result.id).toBe('ticket-1');
    expect(assignment.attemptAutoAssignment).toHaveBeenCalled();
  });

  it('returns 404 obfuscation when booking is not owned', async () => {
    const { service, bookingRepo } = buildService();
    bookingRepo.findOne.mockResolvedValue({
      id: 'booking-1',
      guest_user_id: 'other-guest',
      listing: { host_user_id: 'other-host' },
      listing_id: 'listing-1',
    });

    await expect(
      service.createTicketForUser('guest-1', {
        category: 'BOOKING',
        subject: 'Help',
        message: 'Please help',
        bookingId: 'booking-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 obfuscation when report is not owned', async () => {
    const { service, reportRepo } = buildService();
    reportRepo.findOne.mockResolvedValue({
      id: 'report-1',
      reporter_user_id: 'other-user',
    });

    await expect(
      service.createTicketForUser('guest-1', {
        category: 'OTHER',
        subject: 'Help',
        message: 'Please help',
        reportId: 'report-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ensureTicketForReport is idempotent when ticket already exists', async () => {
    const { service, ticketRepo } = buildService();
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-existing',
      report_id: 'report-1',
    });

    const result = await service.ensureTicketForReport({
      report: {
        id: 'report-1',
        reporter_user_id: 'guest-1',
        reason: 'spam',
      } as never,
      sourceConversation: {
        id: 'booking-conv',
        guest_user_id: 'guest-1',
        host_user_id: 'host-1',
        booking_id: 'booking-1',
        listing_id: 'listing-1',
      } as never,
    });

    expect(result.id).toBe('ticket-existing');
    expect(ticketRepo.findOne).toHaveBeenCalledWith({
      where: { report_id: 'report-1' },
    });
  });

  it('ensureTicketForSafetyIssue is idempotent when ticket already exists', async () => {
    const { service, ticketRepo } = buildService();
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-safety',
      safety_issue_id: 'safety-1',
    });

    const result = await service.ensureTicketForSafetyIssue({
      safety: {
        id: 'safety-1',
        reporter_user_id: 'guest-1',
        category: 'FRAUD',
        details: 'scam',
      } as never,
      sourceConversation: {
        id: 'booking-conv',
        guest_user_id: 'guest-1',
        host_user_id: 'host-1',
        booking_id: 'booking-1',
        listing_id: 'listing-1',
      } as never,
    });

    expect(result.id).toBe('ticket-safety');
    expect(ticketRepo.findOne).toHaveBeenCalledWith({
      where: { safety_issue_id: 'safety-1' },
    });
  });

  it('createTicketForUser reuses ticket for same reportId', async () => {
    const { service, ticketRepo, timelineSeeder } = buildService();
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      ticket_number: 'SUP-2026-000001',
      conversation_id: 'conv-1',
      status: 'OPEN',
      category: 'OTHER',
      subject: 'spam',
      party: 'GUEST',
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      report_id: 'report-1',
      requester_user_id: 'guest-1',
    });

    const result = await service.createTicketForUser('guest-1', {
      category: 'OTHER',
      subject: 'spam',
      message: 'spam',
      reportId: 'report-1',
    });

    expect(result.id).toBe('ticket-1');
    expect(timelineSeeder.insertMessage).not.toHaveBeenCalled();
  });

  it('reuses existing ticket when unique constraint races', async () => {
    const { service, ticketRepo, reportRepo, dataSource } = buildService();
    reportRepo.findOne.mockResolvedValue({
      id: 'report-1',
      reporter_user_id: 'guest-1',
    });
    ticketRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'ticket-race',
        ticket_number: 'SUP-2026-000009',
        conversation_id: 'conv-9',
        status: 'OPEN',
        category: 'OTHER',
        subject: 'spam',
        party: 'GUEST',
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        report_id: 'report-1',
        requester_user_id: 'guest-1',
      });
    dataSource.transaction.mockRejectedValueOnce(uniqueViolation());

    const result = await service.createTicketForUser('guest-1', {
      category: 'OTHER',
      subject: 'spam',
      message: 'spam',
      reportId: 'report-1',
    });

    expect(result.id).toBe('ticket-race');
  });

  it('copies booking/listing/reported user onto canonical report', async () => {
    const { service, reportRepo } = buildService();
    await service.createReport({
      conversationId: 'conv-1',
      reporterUserId: 'guest-1',
      bookingId: 'booking-1',
      listingId: 'listing-1',
      reportedUserId: 'host-1',
    });
    expect(reportRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'OPEN',
        booking_id: 'booking-1',
        listing_id: 'listing-1',
        reported_user_id: 'host-1',
      }),
    );
  });

  it('keeps null context when conversation has none', async () => {
    const { service, safetyRepo } = buildService();
    await service.createSafetyIssue({
      conversationId: 'conv-1',
      reporterUserId: 'guest-1',
      category: 'OTHER',
    });
    expect(safetyRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        booking_id: null,
        listing_id: null,
        reported_user_id: null,
        status: 'OPEN',
      }),
    );
  });

  it('paginates admin tickets and enforces max limit', async () => {
    const { service, ticketQb } = buildService();
    ticketQb.getCount.mockResolvedValue(0);
    ticketQb.getMany.mockResolvedValue([]);

    const empty = await service.listForAdmin({ limit: 500, offset: 0 });
    expect(empty.limit).toBe(100);
    expect(empty.total).toBe(0);
    expect(empty.hasMore).toBe(false);
    expect(empty.items).toEqual([]);
    expect(ticketQb.take).toHaveBeenCalledWith(100);

    await service.listForAdmin({
      status: 'OPEN,IN_PROGRESS',
      priority: 'HIGH',
      search: 'SUP-2026',
    });
    expect(ticketQb.andWhere).toHaveBeenCalled();
  });

  it('dismissed reports remain listed and escalation does not downgrade URGENT', async () => {
    const { service, reportRepo, ticketRepo, staysAudit, convRepo, dataSource, assignment } =
      buildService();
    const report = {
      id: 'report-1',
      status: 'OPEN',
      conversation_id: 'conv-src',
      reporter_user_id: 'guest-1',
      reported_user_id: 'host-1',
      booking_id: null,
      listing_id: null,
      reason: 'spam',
      attachment_ids: [],
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-01T00:00:00.000Z'),
    };
    reportRepo.findOne.mockResolvedValue(report);
    reportRepo.find.mockResolvedValue([{ ...report, status: 'DISMISSED' }]);
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      report_id: 'report-1',
      ticket_number: 'SUP-2026-000001',
      status: 'OPEN',
      priority: 'URGENT',
    });
    ticketRepo.find.mockResolvedValue([]);
    convRepo.findOne.mockResolvedValue({ id: 'conv-src' });

    await service.patchReportForAdmin(
      'report-1',
      { kind: 'conversation_reported', status: 'ESCALATED' },
      'admin-1',
    );
    expect(ticketRepo.save).not.toHaveBeenCalled();
    expect(ticketRepo.update).not.toHaveBeenCalled();
    expect(assignment.attemptAutoAssignment).not.toHaveBeenCalled();
    expect(staysAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'status_changed',
        metadata: expect.objectContaining({
          from: 'OPEN',
          to: 'ESCALATED',
          ticketId: 'ticket-1',
        }),
      }),
    );

    reportRepo.find.mockResolvedValue([{ ...report, status: 'DISMISSED' }]);
    dataSource.query
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([
        { id: 'report-1', kind: 'conversation_reported' },
      ]);
    const listed = await service.listReportsForAdmin();
    expect(listed.items.some((item) => item.status === 'DISMISSED')).toBe(true);
    expect(listed.total).toBe(1);
    expect(listed.hasMore).toBe(false);
  });

  it('auto-assigns when escalation first creates a ticket', async () => {
    const { service, reportRepo, ticketRepo, convRepo, assignment } =
      buildService();
    const report = {
      id: 'report-1',
      status: 'OPEN',
      conversation_id: 'conv-src',
      reporter_user_id: 'guest-1',
      reported_user_id: 'host-1',
      booking_id: null,
      listing_id: null,
      reason: 'spam',
      attachment_ids: [],
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-01T00:00:00.000Z'),
    };
    reportRepo.findOne.mockResolvedValue(report);
    ticketRepo.findOne.mockResolvedValue(null);
    convRepo.findOne.mockResolvedValue({
      id: 'conv-src',
      guest_user_id: 'guest-1',
      host_user_id: 'host-1',
    });
    jest.spyOn(service, 'ensureTicketForReport').mockResolvedValue({
      id: 'ticket-new',
      priority: 'NORMAL',
    } as never);
    jest.spyOn(service, 'getReportForAdmin').mockResolvedValue({} as never);

    await service.patchReportForAdmin(
      'report-1',
      { kind: 'conversation_reported', status: 'ESCALATED' },
      'admin-1',
    );

    expect(assignment.attemptAutoAssignment).toHaveBeenCalledWith('ticket-new');
  });

  it('paginates admin reports with default limit and empty page', async () => {
    const { service, dataSource } = buildService();
    dataSource.query
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);
    const listed = await service.listReportsForAdmin({ limit: 500, offset: 0 });
    expect(listed.limit).toBe(100);
    expect(listed.total).toBe(0);
    expect(listed.items).toEqual([]);
    expect(listed.hasMore).toBe(false);
  });

  it('assigns eligible SUPPORT_AGENT and audits assignment', async () => {
    const { service, ticketRepo, ticketQb, identityUsers, staysAudit } =
      buildService();
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      status: 'OPEN',
      priority: 'NORMAL',
      assigned_admin_id: null,
      resolved_at: null,
      ticket_number: 'SUP-2026-000001',
      subject: 'Help',
      category: 'OTHER',
      party: 'GUEST',
      customer_name: null,
      requester_email: null,
      unread_for_support: false,
      created_at: new Date(),
      updated_at: new Date(),
    });
    ticketRepo.save.mockImplementation(async (row: Record<string, unknown>) => row);

    const row = await service.patchForAdmin(
      'ticket-1',
      { assigned_admin_id: 'agent-2' },
      'admin-1',
    );
    expect(row.status).toBe('OPEN');
    expect(identityUsers.getAuthz).toHaveBeenCalledWith('agent-2');
    expect(ticketQb.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(staysAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'support_ticket_assigned',
        entityType: 'support_ticket',
        metadata: expect.objectContaining({
          fromAdminId: null,
          toAdminId: 'agent-2',
        }),
      }),
    );
  });

  it('rejects GUEST assignee with 422', async () => {
    const { service, ticketRepo, identityUsers } = buildService();
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      status: 'OPEN',
      priority: 'NORMAL',
      assigned_admin_id: null,
    });
    identityUsers.getAuthz.mockResolvedValue({
      account_type: 'GUEST',
      status: 'ACTIVE',
      staff_role: 'SUPPORT_AGENT',
      authz_version: 1,
    });
    await expect(
      service.patchForAdmin('ticket-1', { assigned_admin_id: 'guest-1' }, 'admin-1'),
    ).rejects.toThrow('Support agent is not eligible for assignment');
  });

  it('rejects Super Admin assignee with 422', async () => {
    const { service, ticketRepo, identityUsers } = buildService();
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      status: 'OPEN',
      priority: 'NORMAL',
      assigned_admin_id: null,
    });
    identityUsers.getAuthz.mockResolvedValue({
      account_type: 'ADMIN',
      status: 'ACTIVE',
      staff_role: 'ADMIN',
      authz_version: 1,
    });
    await expect(
      service.patchForAdmin('ticket-1', { assigned_admin_id: 'admin-2' }, 'admin-1'),
    ).rejects.toThrow('Support agent is not eligible for assignment');
  });

  it('rejects frozen assignee with 422', async () => {
    const { service, ticketRepo, identityUsers } = buildService();
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      status: 'OPEN',
      priority: 'NORMAL',
      assigned_admin_id: null,
    });
    identityUsers.getAuthz.mockResolvedValue({
      account_type: 'ADMIN',
      status: 'FROZEN',
      staff_role: 'SUPPORT_AGENT',
      authz_version: 1,
    });
    await expect(
      service.patchForAdmin('ticket-1', { assigned_admin_id: 'frozen-1' }, 'admin-1'),
    ).rejects.toThrow('Support agent is not eligible for assignment');
  });

  it('reassigns and unassigns with audit metadata and does not mutate status', async () => {
    const { service, ticketRepo, identityUsers, staysAudit } = buildService();
    const now = new Date('2026-01-01T00:00:00.000Z');
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      status: 'WAITING_FOR_CUSTOMER',
      priority: 'NORMAL',
      assigned_admin_id: 'agent-a',
      resolved_at: null,
      closed_at: null,
      first_admin_response_at: null,
      ticket_number: 'SUP-2026-000001',
      subject: 'Help',
      category: 'OTHER',
      party: 'GUEST',
      customer_name: null,
      requester_email: null,
      unread_for_support: false,
      created_at: now,
      updated_at: now,
    });
    ticketRepo.save.mockImplementation(async (row: Record<string, unknown>) => row);

    const reassigned = await service.patchForAdmin(
      'ticket-1',
      { assigned_admin_id: 'agent-b' },
      'admin-1',
    );
    expect(reassigned.status).toBe('WAITING_FOR_CUSTOMER');
    expect(reassigned.assigned_admin_id).toBe('agent-b');
    expect(staysAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'support_ticket_assigned',
        metadata: expect.objectContaining({
          fromAdminId: 'agent-a',
          toAdminId: 'agent-b',
        }),
      }),
    );

    staysAudit.log.mockClear();
    identityUsers.getAuthz.mockClear();
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      status: 'WAITING_FOR_CUSTOMER',
      priority: 'NORMAL',
      assigned_admin_id: 'agent-b',
      resolved_at: null,
      closed_at: null,
      first_admin_response_at: null,
      ticket_number: 'SUP-2026-000001',
      subject: 'Help',
      category: 'OTHER',
      party: 'GUEST',
      customer_name: null,
      requester_email: null,
      unread_for_support: false,
      created_at: now,
      updated_at: now,
    });
    const unassigned = await service.patchForAdmin(
      'ticket-1',
      { assigned_admin_id: null },
      'admin-1',
    );
    expect(identityUsers.getAuthz).not.toHaveBeenCalled();
    expect(unassigned.status).toBe('WAITING_FOR_CUSTOMER');
    expect(unassigned.assigned_admin_id).toBeNull();
    expect(staysAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'support_ticket_assigned',
        metadata: expect.objectContaining({
          fromAdminId: 'agent-b',
          toAdminId: null,
        }),
      }),
    );
  });

  it('rejects unknown assignee with 404', async () => {
    const { service, ticketRepo, identityUsers } = buildService();
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      status: 'OPEN',
      priority: 'NORMAL',
      assigned_admin_id: null,
    });
    identityUsers.getAuthz.mockResolvedValue(null);
    await expect(
      service.patchForAdmin('ticket-1', { assigned_admin_id: 'missing' }, 'admin-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects combining unassigned with assignedAdminId', async () => {
    const { service } = buildService();
    await expect(
      service.listForAdmin({ unassigned: true, assignedAdminId: 'admin-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts CSAT for RESOLVED requester and rejects OPEN / duplicate / cross-user', async () => {
    const { service, ticketRepo, csatRepo } = buildService();
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      requester_user_id: 'guest-1',
      status: 'RESOLVED',
    });
    const submitted = await service.submitCsatForUser('guest-1', 'ticket-1', {
      rating: 5,
      comment: 'Great',
    });
    expect(submitted.submitted).toBe(true);
    expect(submitted.csat?.rating).toBe(5);

    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      requester_user_id: 'guest-1',
      status: 'OPEN',
    });
    await expect(
      service.submitCsatForUser('guest-1', 'ticket-1', { rating: 4 }),
    ).rejects.toBeInstanceOf(BadRequestException);

    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      requester_user_id: 'guest-1',
      status: 'CLOSED',
    });
    csatRepo.findOne.mockResolvedValue({
      id: 'csat-1',
      ticket_id: 'ticket-1',
      rating: 5,
      comment: 'Great',
      submitted_at: new Date(),
    });
    await expect(
      service.submitCsatForUser('guest-1', 'ticket-1', { rating: 3 }),
    ).rejects.toBeInstanceOf(ConflictException);

    ticketRepo.findOne.mockResolvedValue(null);
    await expect(
      service.submitCsatForUser('other', 'ticket-1', { rating: 5 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('GET CSAT returns submitted false when absent', async () => {
    const { service, ticketRepo } = buildService();
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      requester_user_id: 'guest-1',
      status: 'RESOLVED',
    });
    await expect(service.getCsatForUser('guest-1', 'ticket-1')).resolves.toEqual({
      submitted: false,
      csat: null,
    });
  });

  it('returns empty analytics for empty created_at range', async () => {
    const { service, dataSource } = buildService();
    dataSource.query
      .mockResolvedValueOnce([
        {
          created: 0,
          open: 0,
          resolved: 0,
          closed: 0,
          escalated: 0,
          assigned: 0,
          unassigned: 0,
          avg_first_response_seconds: null,
          median_first_response_seconds: null,
          avg_first_resolution_seconds: null,
          median_first_resolution_seconds: null,
          avg_closure_seconds: null,
          median_closure_seconds: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          responses: 0,
          average_rating: null,
          r1: 0,
          r2: 0,
          r3: 0,
          r4: 0,
          r5: 0,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const analytics = await service.getAnalyticsForAdmin({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
    });
    expect(analytics.tickets.created).toBe(0);
    expect(analytics.response.averageFirstResponseSeconds).toBeNull();
    expect(analytics.csat.responses).toBe(0);
    expect(analytics.assignment).toEqual({ assigned: 0, unassigned: 0 });
    expect(analytics.statusDistribution).toEqual([]);
    expect(analytics.volume).toEqual([]);
    expect(analytics.sla.firstResponse).toEqual({
      onTrack: 0,
      atRisk: 0,
      breached: 0,
    });
    expect(JSON.stringify(analytics)).not.toMatch(/body|message/);
  });

  it('rejects invalid analytics dates and ranges over 90 days', async () => {
    const { service, dataSource } = buildService();
    await expect(
      service.getAnalyticsForAdmin({ from: 'not-a-date', to: '2026-02-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getAnalyticsForAdmin({
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-02-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getAnalyticsForAdmin({
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-05-02T00:00:00.000Z',
      }),
    ).rejects.toThrow('Date range must be 90 days or less');
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('aggregates analytics volume, status distribution, and assignment', async () => {
    const { service, dataSource } = buildService();
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('AS created') && sql.includes('AS assigned')) {
        return [
          {
            created: 3,
            open: 1,
            resolved: 1,
            closed: 1,
            escalated: 0,
            assigned: 2,
            unassigned: 1,
          },
        ];
      }
      if (sql.includes('fr_state')) return [];
      if (sql.includes('stays_support_ticket_csat')) {
        return [{ responses: 0, average_rating: null, r1: 0, r2: 0, r3: 0, r4: 0, r5: 0 }];
      }
      if (sql.includes('t.category AS category')) return [];
      if (sql.includes('t.priority AS priority')) return [];
      if (sql.includes('t.status AS status')) {
        return [
          { status: 'OPEN', count: 1 },
          { status: 'CLOSED', count: 1 },
          { status: 'RESOLVED', count: 1 },
        ];
      }
      if (sql.includes('generate_series')) {
        return [
          { date: '2026-01-01', created: 2, closed: 0 },
          { date: '2026-01-02', created: 1, closed: 1 },
        ];
      }
      return [];
    });
    const analytics = await service.getAnalyticsForAdmin({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-03T00:00:00.000Z',
    });
    expect(analytics.statusDistribution.map((row) => row.status)).toEqual([
      'OPEN',
      'CLOSED',
      'RESOLVED',
    ]);
    expect(analytics.assignment).toEqual({ assigned: 2, unassigned: 1 });
    expect(analytics.volume).toEqual([
      { date: '2026-01-01', created: 2, closed: 0 },
      { date: '2026-01-02', created: 1, closed: 1 },
    ]);
  });

  it('creates and lists internal notes without body in audit', async () => {
    const { service, ticketRepo, noteRepo, staysAudit } = buildService();
    ticketRepo.findOne.mockResolvedValue({ id: 'ticket-1' });
    noteRepo.createQueryBuilder = jest.fn();
    await service.createNoteForAdmin('ticket-1', 'admin-1', 'Internal only');
    expect(staysAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'support_ticket_note_added',
        metadata: expect.objectContaining({ noteId: 'note-1' }),
      }),
    );
    expect(staysAudit.log.mock.calls[0][0].metadata.body).toBeUndefined();
  });

  it('rejects SUPPORT source conversation for investigation transcript', async () => {
    const { service, reportRepo, convRepo } = buildService();
    reportRepo.findOne.mockResolvedValue({
      id: 'report-1',
      conversation_id: 'conv-support',
    });
    convRepo.findOne.mockResolvedValue({
      id: 'conv-support',
      type: 'SUPPORT',
      guest_user_id: 'g1',
      host_user_id: 'h1',
    });
    await expect(
      service.getInvestigationConversation(
        'report-1',
        'conversation_reported',
        50,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists ticket activity by entity_type and entity_id only', async () => {
    const { service, ticketRepo, auditLogRepo } = buildService();
    ticketRepo.findOne.mockResolvedValue({ id: 'ticket-1' });
    const where = jest.fn().mockReturnThis();
    const andWhere = jest.fn().mockReturnThis();
    const orderBy = jest.fn().mockReturnThis();
    const addOrderBy = jest.fn().mockReturnThis();
    const skip = jest.fn().mockReturnThis();
    const take = jest.fn().mockReturnThis();
    const getCount = jest.fn().mockResolvedValue(1);
    const getMany = jest.fn().mockResolvedValue([
      {
        id: 'audit-1',
        action: 'support_ticket_assigned',
        actor_user_id: 'admin-1',
        metadata: { fromAdminId: null, toAdminId: 'admin-2' },
        created_at: new Date(),
      },
    ]);
    const clone = jest.fn(() => ({ getCount }));
    auditLogRepo.createQueryBuilder = jest.fn(() => ({
      where,
      andWhere,
      orderBy,
      addOrderBy,
      skip,
      take,
      getMany,
      clone,
    }));
    const listed = await service.listTicketActivity('ticket-1', 50, 0);
    expect(where).toHaveBeenCalledWith('a.entity_type = :entityType', {
      entityType: 'support_ticket',
    });
    expect(andWhere).toHaveBeenCalledWith('a.entity_id = :entityId', {
      entityId: 'ticket-1',
    });
    expect(listed.total).toBe(1);
    expect(listed.hasMore).toBe(false);
  });

  it('rolls back REVIEWED when escalation ticket ensure fails', async () => {
    const { service, reportRepo, ticketRepo, staysAudit, convRepo } = buildService();
    const report = {
      id: 'report-1',
      status: 'REVIEWED',
      conversation_id: 'conv-src',
      reporter_user_id: 'guest-1',
      reported_user_id: 'host-1',
      booking_id: null,
      listing_id: null,
      reason: 'spam',
      attachment_ids: [],
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-01T00:00:00.000Z'),
    };
    reportRepo.findOne.mockResolvedValue(report);
    ticketRepo.findOne.mockResolvedValue(null);
    convRepo.findOne.mockResolvedValue({
      id: 'conv-src',
      guest_user_id: 'guest-1',
      host_user_id: 'host-1',
    });
    jest
      .spyOn(service, 'ensureTicketForReport')
      .mockRejectedValue(new Error('ensure failed'));

    await expect(
      service.patchReportForAdmin(
        'report-1',
        { kind: 'conversation_reported', status: 'ESCALATED' },
        'admin-1',
      ),
    ).rejects.toThrow('ensure failed');

    expect(report.status).toBe('REVIEWED');
    expect(reportRepo.save).not.toHaveBeenCalled();
    expect(staysAudit.log).not.toHaveBeenCalled();
  });

  it('rejects PATCH without kind or with invalid status', async () => {
    const missingKind = plainToInstance(PatchTrustReportDto, { status: 'OPEN' });
    const missingKindErrors = await validate(missingKind);
    expect(missingKindErrors.some((e) => e.property === 'kind')).toBe(true);

    const invalidStatus = plainToInstance(PatchTrustReportDto, {
      kind: 'conversation_reported',
      status: 'closed',
    });
    const statusErrors = await validate(invalidStatus);
    expect(statusErrors.some((e) => e.property === 'status')).toBe(true);
  });

  it('refuses evidence that does not belong to the canonical record', async () => {
    const { service } = buildService();
    await expect(
      service.resolveEvidenceForCanonical(['att-other'], ['att-owned']),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('clears unread_for_support when admin lists messages', async () => {
    const { service, ticketRepo, messageRepo } = buildService();
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      conversation_id: 'conv-1',
      unread_for_support: true,
    });
    messageRepo.find.mockResolvedValue([]);
    await service.listMessagesForAdmin('ticket-1');
    expect(ticketRepo.update).toHaveBeenCalledWith(
      'ticket-1',
      expect.objectContaining({ unread_for_support: false }),
    );
  });

  it('maps admin messages as SUPPORT_AGENT', async () => {
    const { service, ticketRepo, convRepo, timelineSeeder, realtime, dataSource } =
      buildService();
    const lockedTicket = {
      id: 'ticket-1',
      conversation_id: 'conv-1',
      requester_user_id: 'guest-1',
      party: 'GUEST',
      status: 'OPEN',
      assigned_admin_id: null,
      first_admin_response_at: null,
    };
    const ticketQb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(lockedTicket),
    };
    const ticketUpdate = jest.fn();
    dataSource.transaction = jest.fn(async (fn: (m: unknown) => unknown) =>
      fn({
        getRepository: jest.fn((entity: unknown) => {
          if (entity === StaysSupportTicket) {
            return {
              createQueryBuilder: jest.fn(() => ticketQb),
              update: ticketUpdate,
            };
          }
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
      }),
    );

    const msg = await service.sendAdminMessage('ticket-1', 'admin-1', 'We can help');
    expect(msg.sender_type).toBe('SUPPORT_AGENT');
    expect(ticketUpdate).toHaveBeenCalledWith(
      'ticket-1',
      expect.objectContaining({
        first_admin_response_at: expect.any(Date),
        assigned_admin_id: 'admin-1',
      }),
    );
    expect(timelineSeeder.insertMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ senderId: 'admin-1' }),
    );
    expect(realtime.publish).toHaveBeenCalledWith(
      'guest-1',
      expect.objectContaining({ reason: 'MESSAGE_CREATED' }),
    );
    expect(ticketRepo.findOne).not.toHaveBeenCalled();
    expect(convRepo.findOne).not.toHaveBeenCalled();
  });

  it('does not overwrite first_admin_response_at on second admin reply', async () => {
    const { service, dataSource } = buildService();
    const firstAt = new Date('2026-01-01T12:00:00.000Z');
    const lockedTicket = {
      id: 'ticket-1',
      conversation_id: 'conv-1',
      requester_user_id: 'guest-1',
      party: 'GUEST',
      status: 'IN_PROGRESS',
      assigned_admin_id: 'admin-1',
      first_admin_response_at: firstAt,
    };
    const ticketUpdate = jest.fn();
    dataSource.transaction = jest.fn(async (fn: (m: unknown) => unknown) =>
      fn({
        getRepository: jest.fn((entity: unknown) => {
          if (entity === StaysSupportTicket) {
            return {
              createQueryBuilder: jest.fn(() => ({
                setLock: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                getOne: jest.fn().mockResolvedValue(lockedTicket),
              })),
              update: ticketUpdate,
            };
          }
          if (entity === StaysConversation) {
            return {
              findOne: jest.fn().mockResolvedValue({
                id: 'conv-1',
                unread_guest: 0,
                type: 'SUPPORT',
              }),
              update: jest.fn(),
            };
          }
          return { update: jest.fn() };
        }),
      }),
    );
    await service.sendAdminMessage('ticket-1', 'admin-1', 'Follow-up');
    expect(ticketUpdate).toHaveBeenCalledWith(
      'ticket-1',
      expect.objectContaining({ first_admin_response_at: firstAt }),
    );
  });

  it('sets closed_at on CLOSED without clearing resolved_at', async () => {
    const { service, ticketRepo } = buildService();
    const resolvedAt = new Date('2026-01-01T00:00:00.000Z');
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      status: 'RESOLVED',
      priority: 'NORMAL',
      assigned_admin_id: 'admin-1',
      resolved_at: resolvedAt,
      closed_at: null,
      ticket_number: 'SUP-1',
      subject: 'Help',
      category: 'OTHER',
      party: 'GUEST',
      customer_name: null,
      requester_email: null,
      unread_for_support: false,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-01T00:00:00.000Z'),
      first_admin_response_at: new Date('2026-01-01T01:00:00.000Z'),
      report_id: null,
      safety_issue_id: null,
    });
    ticketRepo.save.mockImplementation(async (row: Record<string, unknown>) => row);
    const row = await service.patchForAdmin(
      'ticket-1',
      { status: 'CLOSED' },
      'admin-1',
    );
    expect(row.closed_at).toBeTruthy();
    expect(row.resolved_at).toBe(resolvedAt.toISOString());
  });

  it('rejects CLOSED admin send with 409 and does not insert a message', async () => {
    const { service, timelineSeeder, dataSource } = buildService();
    const ticketQb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 'ticket-1',
        status: 'CLOSED',
        conversation_id: 'conv-1',
      }),
    };
    dataSource.transaction = jest.fn(async (fn: (m: unknown) => unknown) =>
      fn({
        getRepository: jest.fn(() => ({
          createQueryBuilder: jest.fn(() => ticketQb),
        })),
      }),
    );

    await expect(
      service.sendAdminMessage('ticket-1', 'admin-1', 'Too late'),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.sendAdminMessage('ticket-1', 'admin-1', 'Too late'),
    ).rejects.toThrow(CLOSED_SUPPORT_TICKET_MESSAGE);
    expect(timelineSeeder.insertMessage).not.toHaveBeenCalled();
  });

  it('applies customer message effects: RESOLVED reopens and preserves resolved_at', async () => {
    const { service } = buildService();
    const update = jest.fn();
    const manager = {
      getRepository: jest.fn(() => ({ update })),
    };
    const resolvedAt = new Date('2026-01-01T00:00:00.000Z');
    await service.applyCustomerSupportMessageEffects(
      manager as never,
      {
        id: 'ticket-1',
        status: 'RESOLVED',
        party: 'GUEST',
        resolved_at: resolvedAt,
      } as never,
      'Follow up',
    );
    expect(update).toHaveBeenCalledWith(
      'ticket-1',
      expect.objectContaining({
        status: 'OPEN',
        unread_for_support: true,
        last_message_preview: 'Follow up',
      }),
    );
    expect(update.mock.calls[0][1].resolved_at).toBeUndefined();
  });

  it('preserves WAITING_FOR_HOST for GUEST party and does not clear resolved_at', async () => {
    const { service } = buildService();
    const update = jest.fn();
    const manager = {
      getRepository: jest.fn(() => ({ update })),
    };
    await service.applyCustomerSupportMessageEffects(
      manager as never,
      {
        id: 'ticket-1',
        status: 'WAITING_FOR_HOST',
        party: 'GUEST',
        resolved_at: new Date('2026-01-01T00:00:00.000Z'),
      } as never,
      'Ping',
    );
    expect(update).toHaveBeenCalledWith(
      'ticket-1',
      expect.objectContaining({
        status: 'WAITING_FOR_HOST',
        unread_for_support: true,
      }),
    );
    expect(update.mock.calls[0][1].resolved_at).toBeUndefined();
  });

  it('rejects CLOSED customer lock with 409', async () => {
    const { service } = buildService();
    const ticketQb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 'ticket-1',
        status: 'CLOSED',
      }),
    };
    const manager = {
      getRepository: jest.fn(() => ({
        createQueryBuilder: jest.fn(() => ticketQb),
      })),
    };
    await expect(
      service.lockTicketForCustomerSend(manager as never, 'conv-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('provisionReportWithTicket uses one TX and rolls back when ticket ensure fails', async () => {
    const { service, reportRepo, dataSource, timelineSeeder } = buildService();
    reportRepo.findOne.mockResolvedValue({
      id: 'report-1',
      reporter_user_id: 'guest-1',
    });
    timelineSeeder.insertMessage.mockRejectedValue(new Error('ticket insert failed'));

    await expect(
      service.provisionReportWithTicket({
        conversationId: 'booking-conv',
        reporterUserId: 'guest-1',
        reason: 'spam',
        sourceConversation: {
          id: 'booking-conv',
          guest_user_id: 'guest-1',
          host_user_id: 'host-1',
          booking_id: null,
          listing_id: null,
        } as never,
      }),
    ).rejects.toThrow('ticket insert failed');

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(reportRepo.save).toHaveBeenCalled();
    // Nested independent TX must not start — insert runs on the shared manager.
    expect(dataSource.transaction.mock.calls.length).toBe(1);
  });

  it('reuses ticket on unique conflict via savepoint without poisoning outer TX', async () => {
    const { service, ticketRepo, reportRepo, manager, dataSource } = buildService();
    const raceTicket = {
      id: 'ticket-race',
      ticket_number: 'SUP-2026-000009',
      conversation_id: 'conv-9',
      status: 'OPEN',
      category: 'OTHER',
      subject: 'spam',
      party: 'GUEST',
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      report_id: 'report-1',
      requester_user_id: 'guest-1',
    };
    reportRepo.findOne.mockResolvedValue({
      id: 'report-1',
      reporter_user_id: 'guest-1',
    });
    ticketRepo.findOne
      .mockResolvedValueOnce(null) // ensure existing
      .mockResolvedValueOnce(null) // createTicket existing by reportId
      .mockResolvedValueOnce(raceTicket) // reuse after 23505
      .mockResolvedValueOnce(raceTicket); // ensure load by id
    ticketRepo.save.mockRejectedValueOnce(uniqueViolation());

    const result = await service.provisionReportWithTicket({
      conversationId: 'booking-conv',
      reporterUserId: 'guest-1',
      reason: 'spam',
      sourceConversation: {
        id: 'booking-conv',
        guest_user_id: 'guest-1',
        host_user_id: 'host-1',
        booking_id: null,
        listing_id: null,
      } as never,
    });

    expect(result.ticket.id).toBe('ticket-race');
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringMatching(/^SAVEPOINT /),
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringMatching(/^ROLLBACK TO SAVEPOINT /),
    );
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('throws when 23505 reuse finds no ticket (no ticket:null success)', async () => {
    const { service, ticketRepo, reportRepo, manager } = buildService();
    reportRepo.findOne.mockResolvedValue({
      id: 'report-1',
      reporter_user_id: 'guest-1',
    });
    ticketRepo.findOne.mockResolvedValue(null);
    ticketRepo.save.mockRejectedValueOnce(uniqueViolation());

    await expect(
      service.provisionReportWithTicket({
        conversationId: 'booking-conv',
        reporterUserId: 'guest-1',
        reason: 'spam',
        sourceConversation: {
          id: 'booking-conv',
          guest_user_id: 'guest-1',
          host_user_id: 'host-1',
          booking_id: null,
          listing_id: null,
        } as never,
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringMatching(/^ROLLBACK TO SAVEPOINT /),
    );
  });

  it('throws when safety 23505 reuse finds no ticket', async () => {
    const { service, ticketRepo, safetyRepo } = buildService();
    safetyRepo.findOne.mockResolvedValue({
      id: 'safety-1',
      reporter_user_id: 'guest-1',
      category: 'FRAUD',
    });
    ticketRepo.findOne.mockResolvedValue(null);
    ticketRepo.save.mockRejectedValueOnce(uniqueViolation());

    await expect(
      service.provisionSafetyIssueWithTicket({
        conversationId: 'booking-conv',
        reporterUserId: 'guest-1',
        category: 'FRAUD',
        details: 'scam',
        sourceConversation: {
          id: 'booking-conv',
          guest_user_id: 'guest-1',
          host_user_id: 'host-1',
          booking_id: null,
          listing_id: null,
        } as never,
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('does not escalate when source conversation is missing', async () => {
    const { service, reportRepo, ticketRepo, staysAudit, convRepo } = buildService();
    const report = {
      id: 'report-1',
      status: 'REVIEWED',
      conversation_id: 'missing-conv',
      reporter_user_id: 'guest-1',
      reported_user_id: 'host-1',
      booking_id: null,
      listing_id: null,
      reason: 'spam',
      attachment_ids: [],
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-01T00:00:00.000Z'),
    };
    reportRepo.findOne.mockResolvedValue(report);
    ticketRepo.findOne.mockResolvedValue(null);
    convRepo.findOne.mockResolvedValue(null);

    await expect(
      service.patchReportForAdmin(
        'report-1',
        { kind: 'conversation_reported', status: 'ESCALATED' },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(report.status).toBe('REVIEWED');
    expect(reportRepo.save).not.toHaveBeenCalled();
    expect(staysAudit.log).not.toHaveBeenCalled();
  });

  it('keeps REVIEWED when escalate hits unrecovered 23505', async () => {
    const { service, reportRepo, ticketRepo, staysAudit, convRepo } = buildService();
    const report = {
      id: 'report-1',
      status: 'REVIEWED',
      conversation_id: 'conv-src',
      reporter_user_id: 'guest-1',
      reported_user_id: 'host-1',
      booking_id: null,
      listing_id: null,
      reason: 'spam',
      attachment_ids: [],
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: new Date('2026-01-01T00:00:00.000Z'),
    };
    reportRepo.findOne.mockResolvedValue(report);
    ticketRepo.findOne.mockResolvedValue(null);
    convRepo.findOne.mockResolvedValue({
      id: 'conv-src',
      guest_user_id: 'guest-1',
      host_user_id: 'host-1',
    });
    ticketRepo.save.mockRejectedValue(uniqueViolation());

    await expect(
      service.patchReportForAdmin(
        'report-1',
        { kind: 'conversation_reported', status: 'ESCALATED' },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(report.status).toBe('REVIEWED');
    expect(reportRepo.save).not.toHaveBeenCalled();
    expect(staysAudit.log).not.toHaveBeenCalled();
  });

  describe('ticket isolation for SUPPORT_AGENT', () => {
    const agentA = { userId: 'agent-a', role: 'SUPPORT_AGENT' as const };

    function ticketRow(
      overrides: Record<string, unknown> = {},
    ): Record<string, unknown> {
      const now = new Date('2026-01-01T00:00:00.000Z');
      return {
        id: 'ticket-a',
        ticket_number: 'SUP-2026-000001',
        subject: 'Help',
        category: 'OTHER',
        customer_name: null,
        party: 'GUEST',
        assigned_admin_id: 'agent-a',
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

    it('lists only the agent queue and ignores assignedAdminId / unassigned', async () => {
      const { service, ticketQb } = buildService();
      ticketQb.getCount.mockResolvedValue(0);
      ticketQb.getMany.mockResolvedValue([]);
      await service.listForAdmin(
        { assignedAdminId: 'agent-b', unassigned: true },
        agentA,
      );
      expect(ticketQb.andWhere).toHaveBeenCalledWith(
        't.assigned_admin_id = :assignedAdminId',
        { assignedAdminId: 'agent-a' },
      );
      expect(
        ticketQb.andWhere.mock.calls.some((call: unknown[]) =>
          String(call[0]).includes('IS NULL'),
        ),
      ).toBe(false);
    });

    it('cannot expand the queue with requesterUserId', async () => {
      const { service, ticketQb } = buildService();
      ticketQb.getCount.mockResolvedValue(0);
      ticketQb.getMany.mockResolvedValue([]);
      await service.listForAdmin(
        { requesterUserId: 'guest-other' },
        agentA,
      );
      expect(ticketQb.andWhere).toHaveBeenCalledWith(
        't.assigned_admin_id = :assignedAdminId',
        { assignedAdminId: 'agent-a' },
      );
      expect(ticketQb.andWhere).toHaveBeenCalledWith(
        't.requester_user_id = :requesterUserId',
        { requesterUserId: 'guest-other' },
      );
    });

    it('GET own ticket 200, foreign unassigned and guessed UUID 404', async () => {
      const { service, ticketRepo } = buildService();
      ticketRepo.findOne.mockResolvedValue(ticketRow());
      const own = await service.getForAdmin('ticket-a', agentA);
      expect(own.id).toBe('ticket-a');

      ticketRepo.findOne.mockResolvedValue(
        ticketRow({ id: 'ticket-b', assigned_admin_id: 'agent-b' }),
      );
      await expect(service.getForAdmin('ticket-b', agentA)).rejects.toMatchObject({
        message: 'Ticket not found',
      });

      ticketRepo.findOne.mockResolvedValue(
        ticketRow({ id: 'ticket-u', assigned_admin_id: null }),
      );
      await expect(service.getForAdmin('ticket-u', agentA)).rejects.toMatchObject({
        message: 'Ticket not found',
      });

      ticketRepo.findOne.mockResolvedValue(null);
      await expect(
        service.getForAdmin('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', agentA),
      ).rejects.toMatchObject({ message: 'Ticket not found' });
    });

    it('messages notes and activity follow the same ownership 404', async () => {
      const { service, ticketRepo, messageRepo } = buildService();
      ticketRepo.findOne.mockResolvedValue(ticketRow());
      messageRepo.find.mockResolvedValue([]);
      await expect(
        service.listMessagesForAdmin('ticket-a', agentA),
      ).resolves.toEqual({ items: [] });
      await expect(
        service.listNotesForAdmin('ticket-a', 100, agentA),
      ).resolves.toEqual({ items: [] });
      await expect(
        service.listTicketActivity('ticket-a', 50, 0, agentA),
      ).resolves.toEqual(expect.objectContaining({ items: [] }));
      await expect(
        service.createNoteForAdmin('ticket-a', 'agent-a', 'note', agentA),
      ).resolves.toEqual(expect.objectContaining({ body: 'note' }));

      ticketRepo.findOne.mockResolvedValue(
        ticketRow({ id: 'ticket-b', assigned_admin_id: 'agent-b' }),
      );
      await expect(
        service.listMessagesForAdmin('ticket-b', agentA),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.listNotesForAdmin('ticket-b', 100, agentA),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.listTicketActivity('ticket-b', 50, 0, agentA),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.createNoteForAdmin('ticket-b', 'agent-a', 'note', agentA),
      ).rejects.toBeInstanceOf(NotFoundException);

      ticketRepo.findOne.mockResolvedValue(
        ticketRow({ id: 'ticket-u', assigned_admin_id: null }),
      );
      await expect(
        service.listMessagesForAdmin('ticket-u', agentA),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.listNotesForAdmin('ticket-u', 100, agentA),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.createNoteForAdmin('ticket-u', 'agent-a', 'note', agentA),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.listTicketActivity('ticket-u', 50, 0, agentA),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('POST message to unassigned 404s and does not auto-claim', async () => {
      const { service, timelineSeeder, dataSource } = buildService();
      const ticketUpdate = jest.fn();
      dataSource.transaction = jest.fn(async (fn: (m: unknown) => unknown) =>
        fn({
          getRepository: jest.fn(() => ({
            createQueryBuilder: jest.fn(() => ({
              setLock: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              getOne: jest.fn().mockResolvedValue(
                ticketRow({ assigned_admin_id: null }),
              ),
            })),
            update: ticketUpdate,
          })),
        }),
      );
      await expect(
        service.sendAdminMessage('ticket-a', 'agent-a', 'Hello', agentA),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(timelineSeeder.insertMessage).not.toHaveBeenCalled();
      expect(ticketUpdate).not.toHaveBeenCalled();
    });

    it('PATCH own status allowed; priority and assignment 403; foreign 404 not 403', async () => {
      const { service, ticketRepo } = buildService();
      ticketRepo.findOne.mockResolvedValue(ticketRow({ status: 'OPEN' }));
      ticketRepo.save.mockImplementation(async (row: Record<string, unknown>) => row);
      const row = await service.patchForAdmin(
        'ticket-a',
        { status: 'IN_PROGRESS' },
        'agent-a',
        agentA,
      );
      expect(row.status).toBe('IN_PROGRESS');

      ticketRepo.findOne.mockResolvedValue(ticketRow());
      await expect(
        service.patchForAdmin(
          'ticket-a',
          { priority: 'HIGH' },
          'agent-a',
          agentA,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.patchForAdmin(
          'ticket-a',
          { assigned_admin_id: 'agent-b' },
          'agent-a',
          agentA,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      ticketRepo.findOne.mockResolvedValue(
        ticketRow({ id: 'ticket-b', assigned_admin_id: 'agent-b' }),
      );
      await expect(
        service.patchForAdmin(
          'ticket-b',
          { status: 'IN_PROGRESS' },
          'agent-a',
          agentA,
        ),
      ).rejects.toMatchObject({ message: 'Ticket not found' });
      await expect(
        service.patchForAdmin(
          'ticket-b',
          { priority: 'HIGH' },
          'agent-a',
          agentA,
        ),
      ).rejects.toMatchObject({ message: 'Ticket not found' });
      await expect(
        service.patchForAdmin(
          'ticket-b',
          { assigned_admin_id: 'agent-a' },
          'agent-a',
          agentA,
        ),
      ).rejects.toMatchObject({ message: 'Ticket not found' });
    });

    it('allows notes on CLOSED tickets and never inserts a customer message', async () => {
      const { service, ticketRepo, timelineSeeder, messageRepo } = buildService();
      ticketRepo.findOne.mockResolvedValue(ticketRow({ status: 'CLOSED' }));
      const note = await service.createNoteForAdmin(
        'ticket-a',
        'agent-a',
        'Internal after close',
        agentA,
      );
      expect(note.body).toBe('Internal after close');
      expect(timelineSeeder.insertMessage).not.toHaveBeenCalled();
      expect(messageRepo.find).not.toHaveBeenCalled();
    });
  });
});
