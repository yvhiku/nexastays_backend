import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { StaysConversation } from '../messaging/entities/stays-conversation.entity';
import { StaysMessage } from '../messaging/entities/stays-message.entity';
import { TimelineSeederService } from '../messaging/timeline-seeder.service';
import { MessagingRealtimeService } from '../messaging/messaging-realtime.service';
import { StaysBooking } from '../stays/entities/stays-booking.entity';
import { StaysListing } from '../stays/entities/stays-listing.entity';
import { StaysHostProfile } from '../stays/entities/stays-host-profile.entity';
import {
  StaysSupportTicket,
  SupportTicketParty,
  SupportTicketCategory,
  SupportTicketStatus,
  SupportTicketPriority,
} from './entities/stays-support-ticket.entity';
import { StaysConversationReport } from './entities/stays-conversation-report.entity';
import { StaysSafetyIssue } from './entities/stays-safety-issue.entity';
import { StaysSupportTicketRefCounter } from './entities/stays-support-ticket-ref-counter.entity';
import { CreateSupportTicketDto, PatchSupportTicketDto } from './dto/support-ticket.dto';

@Injectable()
export class SupportTicketsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(StaysSupportTicket)
    private readonly ticketRepo: Repository<StaysSupportTicket>,
    @InjectRepository(StaysConversationReport)
    private readonly reportRepo: Repository<StaysConversationReport>,
    @InjectRepository(StaysSafetyIssue)
    private readonly safetyRepo: Repository<StaysSafetyIssue>,
    @InjectRepository(StaysConversation)
    private readonly convRepo: Repository<StaysConversation>,
    @InjectRepository(StaysMessage)
    private readonly messageRepo: Repository<StaysMessage>,
    @InjectRepository(StaysBooking)
    private readonly bookingRepo: Repository<StaysBooking>,
    @InjectRepository(StaysListing)
    private readonly listingRepo: Repository<StaysListing>,
    @InjectRepository(StaysHostProfile)
    private readonly hostProfileRepo: Repository<StaysHostProfile>,
    private readonly timelineSeeder: TimelineSeederService,
    private readonly realtime: MessagingRealtimeService,
  ) {}

  async createReport(input: {
    conversationId: string;
    reporterUserId: string;
    reason?: string;
    attachmentIds?: string[];
  }): Promise<StaysConversationReport> {
    const row = this.reportRepo.create({
      conversation_id: input.conversationId,
      reporter_user_id: input.reporterUserId,
      reason: input.reason?.trim() || null,
      attachment_ids: input.attachmentIds ?? [],
      status: 'open',
    });
    return this.reportRepo.save(row);
  }

  async createSafetyIssue(input: {
    conversationId: string;
    reporterUserId: string;
    category: string;
    details?: string;
    attachmentIds?: string[];
  }): Promise<StaysSafetyIssue> {
    const row = this.safetyRepo.create({
      conversation_id: input.conversationId,
      reporter_user_id: input.reporterUserId,
      category: input.category,
      details: input.details?.trim() || null,
      attachment_ids: input.attachmentIds ?? [],
      status: 'open',
    });
    return this.safetyRepo.save(row);
  }

  async createTicketForUser(
    userId: string,
    dto: CreateSupportTicketDto,
    options: { party?: SupportTicketParty; customerName?: string | null } = {},
  ) {
    const party = options.party ?? (await this.resolveParty(userId));
    const links = await this.resolveOwnedLinks(userId, party, dto);

    const created = await this.dataSource.transaction(async (manager) => {
      const ticketNumber = await this.allocateTicketNumber(manager);
      const conversation = await this.createSupportConversation(
        manager,
        userId,
        party,
        links.listingId,
      );

      const preview = dto.message.trim().slice(0, 200);
      const ticket = manager.getRepository(StaysSupportTicket).create({
        ticket_number: ticketNumber,
        requester_user_id: userId,
        party,
        category: dto.category as SupportTicketCategory,
        subject: dto.subject.trim(),
        status: 'OPEN',
        priority: 'NORMAL',
        assigned_admin_id: null,
        conversation_id: conversation.id,
        booking_id: links.bookingId,
        listing_id: links.listingId,
        report_id: links.reportId,
        safety_issue_id: links.safetyIssueId,
        unread_for_support: true,
        last_message_preview: preview,
        customer_name: options.customerName ?? null,
        resolved_at: null,
      });
      const savedTicket = await manager.getRepository(StaysSupportTicket).save(ticket);

      await this.timelineSeeder.insertMessage(manager, conversation, {
        type: 'TEXT',
        body: dto.message.trim(),
        metadata: {
          source: 'USER',
          schemaVersion: 1,
          cardVersion: 1,
          presentationVersion: 1,
          supportTicketId: savedTicket.id,
          ...(dto.clientRequestId ? { clientRequestId: dto.clientRequestId } : {}),
        },
        senderId: userId,
        clientMessageId: dto.clientRequestId ?? null,
        senderDisplayName: options.customerName ?? 'Customer',
      });

      return savedTicket;
    });

    this.realtime.publish(userId, {
      conversationId: created.conversation_id,
      reason: 'MESSAGE_CREATED',
    });

    return {
      id: created.id,
      ticket_number: created.ticket_number,
      conversation_id: created.conversation_id,
      status: created.status,
      category: created.category,
      subject: created.subject,
      party: created.party,
      created_at: created.created_at.toISOString(),
    };
  }

  async listForUser(userId: string, limit = 50) {
    const take = Math.min(Math.max(limit, 1), 200);
    const rows = await this.ticketRepo.find({
      where: { requester_user_id: userId },
      order: { updated_at: 'DESC' },
      take,
    });
    return { items: rows.map((row) => this.toListRow(row)) };
  }

  async getForUser(userId: string, ticketId: string) {
    const ticket = await this.ticketRepo.findOne({
      where: { id: ticketId, requester_user_id: userId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return this.toListRow(ticket);
  }

  async listForAdmin(limit = 200) {
    const take = Math.min(Math.max(limit, 1), 200);
    const rows = await this.ticketRepo.find({
      order: { updated_at: 'DESC' },
      take,
    });
    const bookingRefs = await this.loadBookingRefs(
      rows.map((r) => r.booking_id).filter(Boolean) as string[],
    );
    return {
      items: rows.map((row) =>
        this.toListRow(row, bookingRefs.get(row.booking_id ?? '') ?? null),
      ),
    };
  }

  async getForAdmin(ticketId: string) {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const bookingRefs = ticket.booking_id
      ? await this.loadBookingRefs([ticket.booking_id])
      : new Map<string, string>();

    let listing: Record<string, unknown> | null = null;
    if (ticket.listing_id) {
      const row = await this.listingRepo.findOne({ where: { id: ticket.listing_id } });
      if (row) {
        listing = {
          id: row.id,
          title: row.title,
          host_user_id: row.host_user_id,
          city: row.city,
        };
      }
    }

    let report: Record<string, unknown> | null = null;
    if (ticket.report_id) {
      const row = await this.reportRepo.findOne({ where: { id: ticket.report_id } });
      if (row) {
        report = {
          id: row.id,
          reason: row.reason,
          conversation_id: row.conversation_id,
          reporter_user_id: row.reporter_user_id,
        };
      }
    }

    let safety_issue: Record<string, unknown> | null = null;
    if (ticket.safety_issue_id) {
      const row = await this.safetyRepo.findOne({ where: { id: ticket.safety_issue_id } });
      if (row) {
        safety_issue = {
          id: row.id,
          category: row.category,
          details: row.details,
          conversation_id: row.conversation_id,
          reporter_user_id: row.reporter_user_id,
        };
      }
    }

    return {
      ...this.toListRow(ticket, bookingRefs.get(ticket.booking_id ?? '') ?? null),
      conversation_id: ticket.conversation_id,
      listing,
      report,
      safety_issue,
    };
  }

  async patchForAdmin(ticketId: string, patch: PatchSupportTicketDto) {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (patch.status !== undefined) {
      ticket.status = patch.status as SupportTicketStatus;
      if (patch.status === 'RESOLVED' || patch.status === 'CLOSED') {
        ticket.resolved_at = ticket.resolved_at ?? new Date();
      } else {
        ticket.resolved_at = null;
      }
    }
    if (patch.priority !== undefined) {
      ticket.priority = patch.priority as SupportTicketPriority;
    }
    if (patch.assigned_admin_id !== undefined) {
      ticket.assigned_admin_id = patch.assigned_admin_id;
    }
    ticket.updated_at = new Date();
    const saved = await this.ticketRepo.save(ticket);
    return this.toListRow(saved);
  }

  async listMessagesForAdmin(ticketId: string) {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (ticket.unread_for_support) {
      await this.ticketRepo.update(ticket.id, {
        unread_for_support: false,
        updated_at: new Date(),
      });
    }

    const messages = await this.messageRepo.find({
      where: { conversation_id: ticket.conversation_id },
      order: { conversation_sequence: 'ASC' },
      take: 500,
    });

    return {
      items: messages
        .filter((m) => m.type !== 'SYSTEM_INTERNAL' && !m.deleted_at)
        .map((m) => ({
          id: m.id,
          sender_type: this.resolveSenderType(ticket, m.sender_id, m.is_system),
          sender_id: m.sender_id,
          body: m.body ?? '',
          created_at: (m.sent_at ?? m.created_at).toISOString(),
        })),
    };
  }

  async sendAdminMessage(ticketId: string, adminUserId: string, body: string) {
    const trimmed = body.trim();
    if (!trimmed) throw new BadRequestException('Message body required');

    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status === 'CLOSED') {
      throw new NotFoundException('Ticket not found');
    }

    const conv = await this.convRepo.findOne({ where: { id: ticket.conversation_id } });
    if (!conv) throw new NotFoundException('Ticket not found');

    const saved = await this.dataSource.transaction(async (manager) => {
      const message = await this.timelineSeeder.insertMessage(manager, conv, {
        type: 'TEXT',
        body: trimmed,
        metadata: {
          source: 'SUPPORT_AGENT',
          schemaVersion: 1,
          cardVersion: 1,
          presentationVersion: 1,
          supportTicketId: ticket.id,
        },
        senderId: adminUserId,
        senderDisplayName: 'Support',
      });

      const unreadPatch =
        ticket.party === 'GUEST'
          ? { unread_guest: (conv.unread_guest ?? 0) + 1 }
          : { unread_host: (conv.unread_host ?? 0) + 1 };

      await manager.getRepository(StaysConversation).update(conv.id, unreadPatch);
      await manager.getRepository(StaysSupportTicket).update(ticket.id, {
        unread_for_support: false,
        last_message_preview: trimmed.slice(0, 200),
        assigned_admin_id: ticket.assigned_admin_id ?? adminUserId,
        status:
          ticket.status === 'OPEN' || ticket.status === 'WAITING_FOR_CUSTOMER'
            ? 'IN_PROGRESS'
            : ticket.status,
        updated_at: new Date(),
      });

      return message;
    });

    this.realtime.publish(ticket.requester_user_id, {
      conversationId: conv.id,
      reason: 'MESSAGE_CREATED',
      messageId: saved.id,
    });

    return {
      id: saved.id,
      sender_type: 'SUPPORT_AGENT',
      sender_id: adminUserId,
      body: trimmed,
      created_at: (saved.sent_at ?? saved.created_at).toISOString(),
    };
  }

  async markUnreadForSupportFromCustomerMessage(
    conversationId: string,
    preview: string,
  ): Promise<void> {
    await this.ticketRepo.update(
      { conversation_id: conversationId },
      {
        unread_for_support: true,
        last_message_preview: preview.slice(0, 200),
        updated_at: new Date(),
      },
    );
  }

  async listReportsForAdmin(limit = 200) {
    const take = Math.min(Math.max(limit, 1), 200);
    const [reports, safety] = await Promise.all([
      this.reportRepo.find({ order: { created_at: 'DESC' }, take }),
      this.safetyRepo.find({ order: { created_at: 'DESC' }, take }),
    ]);

    const ticketByReport = reports.length
      ? await this.ticketRepo
          .createQueryBuilder('t')
          .where('t.report_id IN (:...ids)', { ids: reports.map((r) => r.id) })
          .getMany()
      : [];
    const ticketBySafety = safety.length
      ? await this.ticketRepo
          .createQueryBuilder('t')
          .where('t.safety_issue_id IN (:...ids)', {
            ids: safety.map((s) => s.id),
          })
          .getMany()
      : [];
    const reportTicket = new Map(
      ticketByReport.filter((t) => t.report_id).map((t) => [t.report_id!, t.id]),
    );
    const safetyTicket = new Map(
      ticketBySafety
        .filter((t) => t.safety_issue_id)
        .map((t) => [t.safety_issue_id!, t.id]),
    );

    const items = [
      ...reports.map((row) => ({
        id: row.id,
        kind: 'conversation_reported' as const,
        reason: row.reason ?? undefined,
        category: undefined as string | undefined,
        actor_user_id: row.reporter_user_id,
        conversation_id: row.conversation_id,
        booking_id: undefined as string | undefined,
        listing_id: undefined as string | undefined,
        support_ticket_id: reportTicket.get(row.id),
        created_at: row.created_at.toISOString(),
        status: row.status,
      })),
      ...safety.map((row) => ({
        id: row.id,
        kind: 'safety_issue' as const,
        reason: undefined as string | undefined,
        category: row.category,
        actor_user_id: row.reporter_user_id,
        conversation_id: row.conversation_id,
        booking_id: undefined as string | undefined,
        listing_id: undefined as string | undefined,
        support_ticket_id: safetyTicket.get(row.id),
        created_at: row.created_at.toISOString(),
        status: row.status,
      })),
    ].sort((a, b) => b.created_at.localeCompare(a.created_at));

    return { items: items.slice(0, take) };
  }

  private async resolveParty(userId: string): Promise<SupportTicketParty> {
    const host = await this.hostProfileRepo.findOne({
      where: { user_id: userId },
    });
    return host ? 'HOST' : 'GUEST';
  }

  private async resolveOwnedLinks(
    userId: string,
    party: SupportTicketParty,
    dto: CreateSupportTicketDto,
  ): Promise<{
    bookingId: string | null;
    listingId: string | null;
    reportId: string | null;
    safetyIssueId: string | null;
  }> {
    let bookingId: string | null = null;
    let listingId: string | null = null;

    if (dto.bookingId) {
      const booking = await this.bookingRepo.findOne({
        where: { id: dto.bookingId },
        relations: ['listing'],
      });
      if (!booking) throw new NotFoundException('Ticket not found');
      const ownsAsGuest = booking.guest_user_id === userId;
      const ownsAsHost = booking.listing?.host_user_id === userId;
      if (!ownsAsGuest && !ownsAsHost) {
        throw new NotFoundException('Ticket not found');
      }
      bookingId = booking.id;
      listingId = booking.listing_id;
    }

    if (dto.listingId) {
      const listing = await this.listingRepo.findOne({ where: { id: dto.listingId } });
      if (!listing) throw new NotFoundException('Ticket not found');
      if (party === 'HOST' && listing.host_user_id !== userId) {
        throw new NotFoundException('Ticket not found');
      }
      if (party === 'GUEST' && !bookingId) {
        // Guests may link a listing only via an owned booking path; bare listing requires ownership as host.
        if (listing.host_user_id !== userId) {
          throw new NotFoundException('Ticket not found');
        }
      }
      listingId = listing.id;
    }

    let reportId: string | null = null;
    if (dto.reportId) {
      const report = await this.reportRepo.findOne({ where: { id: dto.reportId } });
      if (!report || report.reporter_user_id !== userId) {
        throw new NotFoundException('Ticket not found');
      }
      reportId = report.id;
    }

    let safetyIssueId: string | null = null;
    if (dto.safetyIssueId) {
      const safety = await this.safetyRepo.findOne({ where: { id: dto.safetyIssueId } });
      if (!safety || safety.reporter_user_id !== userId) {
        throw new NotFoundException('Ticket not found');
      }
      safetyIssueId = safety.id;
    }

    return { bookingId, listingId, reportId, safetyIssueId };
  }

  private async allocateTicketNumber(manager: EntityManager): Promise<string> {
    const year = new Date().getUTCFullYear();
    await manager.query(
      `INSERT INTO stays_support_ticket_ref_counters (year, counter)
       VALUES ($1, 1)
       ON CONFLICT (year) DO UPDATE
       SET counter = stays_support_ticket_ref_counters.counter + 1`,
      [year],
    );
    const rows = await manager.query(
      `SELECT counter FROM stays_support_ticket_ref_counters WHERE year = $1`,
      [year],
    );
    const counter = Number(rows?.[0]?.counter ?? 1);
    return `SUP-${year}-${String(counter).padStart(6, '0')}`;
  }

  private async createSupportConversation(
    manager: EntityManager,
    userId: string,
    party: SupportTicketParty,
    listingId: string | null,
  ): Promise<StaysConversation> {
    const convRepo = manager.getRepository(StaysConversation);
    const conv = convRepo.create({
      booking_id: null,
      type: 'SUPPORT',
      messaging_state: 'ACTIVE',
      guest_visibility: 'ACTIVE',
      host_visibility: 'ACTIVE',
      reservation_snapshot: {},
      listing_id: listingId,
      guest_user_id: party === 'GUEST' ? userId : null,
      host_user_id: party === 'HOST' ? userId : null,
      last_message_sequence: '0',
      unread_guest: 0,
      unread_host: 0,
    });
    return convRepo.save(conv);
  }

  private async loadBookingRefs(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await this.bookingRepo
      .createQueryBuilder('b')
      .select(['b.id', 'b.booking_reference'])
      .where('b.id IN (:...ids)', { ids })
      .getMany();
    return new Map(rows.map((r) => [r.id, r.booking_reference]));
  }

  private toListRow(ticket: StaysSupportTicket, bookingRef: string | null = null) {
    return {
      id: ticket.id,
      ticket_number: ticket.ticket_number,
      subject: ticket.subject,
      category: ticket.category,
      customer_name: ticket.customer_name ?? 'Customer',
      party: ticket.party,
      party_type: ticket.party,
      assigned_admin_id: ticket.assigned_admin_id,
      status: ticket.status,
      priority: ticket.priority,
      created_at: ticket.created_at.toISOString(),
      updated_at: ticket.updated_at.toISOString(),
      resolved_at: ticket.resolved_at?.toISOString() ?? null,
      booking_id: ticket.booking_id,
      booking_reference: bookingRef,
      listing_id: ticket.listing_id,
      report_id: ticket.report_id,
      safety_issue_id: ticket.safety_issue_id,
      unread_for_support: ticket.unread_for_support,
      last_message_preview: ticket.last_message_preview,
    };
  }

  private resolveSenderType(
    ticket: StaysSupportTicket,
    senderId: string | null,
    isSystem: boolean,
  ): 'SUPPORT_AGENT' | 'SYSTEM' | 'CUSTOMER' {
    if (isSystem || !senderId) return 'SYSTEM';
    if (senderId === ticket.requester_user_id) return 'CUSTOMER';
    return 'SUPPORT_AGENT';
  }
}
