import { NotFoundException } from '@nestjs/common';
import { SupportTicketsService } from './support-tickets.service';
import { StaysConversation } from '../messaging/entities/stays-conversation.entity';
import { StaysSupportTicket } from './entities/stays-support-ticket.entity';

describe('SupportTicketsService', () => {
  function buildService() {
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
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    const reportRepo = {
      create: jest.fn((row: unknown) => row),
      save: jest.fn(async (row: Record<string, unknown>) => ({
        ...row,
        id: 'report-1',
      })),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };
    const safetyRepo = {
      create: jest.fn((row: unknown) => row),
      save: jest.fn(async (row: Record<string, unknown>) => ({
        ...row,
        id: 'safety-1',
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
    const bookingRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };
    const listingRepo = { findOne: jest.fn() };
    const hostProfileRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const timelineSeeder = {
      insertMessage: jest.fn().mockResolvedValue({
        id: 'msg-1',
        sent_at: new Date(),
        created_at: new Date(),
      }),
    };
    const realtime = { publish: jest.fn() };

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
      bookingRepo as never,
      listingRepo as never,
      hostProfileRepo as never,
      timelineSeeder as never,
      realtime as never,
    );

    return {
      service,
      ticketRepo,
      reportRepo,
      bookingRepo,
      timelineSeeder,
      realtime,
      dataSource,
      manager,
      convRepo,
    };
  }

  it('creates ticket + SUPPORT conversation + first message transactionally', async () => {
    const { service, timelineSeeder, realtime } = buildService();

    const result = await service.createTicketForUser('guest-1', {
      category: 'BOOKING',
      subject: 'Help with booking',
      message: 'I need help',
    });

    expect(result.ticket_number).toMatch(/^SUP-\d{4}-000007$/);
    expect(result.conversation_id).toBe('conv-1');
    expect(timelineSeeder.insertMessage).toHaveBeenCalled();
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

  it('maps admin messages as SUPPORT_AGENT', async () => {
    const { service, ticketRepo, convRepo, timelineSeeder, realtime, dataSource } =
      buildService();
    ticketRepo.findOne.mockResolvedValue({
      id: 'ticket-1',
      conversation_id: 'conv-1',
      requester_user_id: 'guest-1',
      party: 'GUEST',
      status: 'OPEN',
      assigned_admin_id: null,
    });
    convRepo.findOne.mockResolvedValue({
      id: 'conv-1',
      unread_guest: 0,
      unread_host: 0,
      type: 'SUPPORT',
    });

    dataSource.transaction = jest.fn(async (fn: (m: unknown) => unknown) =>
      fn({
        getRepository: jest.fn(() => ({ update: jest.fn() })),
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
  });
});
