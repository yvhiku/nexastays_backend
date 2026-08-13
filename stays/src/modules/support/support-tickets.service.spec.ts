import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SupportTicketsService } from './support-tickets.service';
import { StaysConversation } from '../messaging/entities/stays-conversation.entity';
import { StaysSupportTicket } from './entities/stays-support-ticket.entity';
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
    };
    const staysAudit = { log: jest.fn().mockResolvedValue(undefined) };

    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([{ counter: '7' }]),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === StaysConversation) return convRepo;
        if (entity === StaysSupportTicket) return ticketRepo;
        return ticketRepo;
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
      reportRepo as never,
      safetyRepo as never,
      convRepo as never,
      messageRepo as never,
      attachmentRepo as never,
      bookingRepo as never,
      listingRepo as never,
      hostProfileRepo as never,
      timelineSeeder as never,
      realtime as never,
      media as never,
      identityUsers as never,
      staysAudit as never,
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

    expect(result?.id).toBe('ticket-existing');
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

    expect(result?.id).toBe('ticket-safety');
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
    const { service, reportRepo, ticketRepo, staysAudit, convRepo } = buildService();
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
    const listed = await service.listReportsForAdmin();
    expect(listed.items.some((item) => item.status === 'DISMISSED')).toBe(true);
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
    };
    const ticketQb = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(lockedTicket),
    };
    dataSource.transaction = jest.fn(async (fn: (m: unknown) => unknown) =>
      fn({
        getRepository: jest.fn((entity: unknown) => {
          if (entity === StaysSupportTicket) {
            return {
              createQueryBuilder: jest.fn(() => ticketQb),
              update: jest.fn(),
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

  it('applies customer message effects: RESOLVED reopens and clears resolved_at', async () => {
    const { service } = buildService();
    const update = jest.fn();
    const manager = {
      getRepository: jest.fn(() => ({ update })),
    };
    await service.applyCustomerSupportMessageEffects(
      manager as never,
      {
        id: 'ticket-1',
        status: 'RESOLVED',
        party: 'GUEST',
        resolved_at: new Date('2026-01-01T00:00:00.000Z'),
      } as never,
      'Follow up',
    );
    expect(update).toHaveBeenCalledWith(
      'ticket-1',
      expect.objectContaining({
        status: 'OPEN',
        unread_for_support: true,
        resolved_at: null,
        last_message_preview: 'Follow up',
      }),
    );
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
});
