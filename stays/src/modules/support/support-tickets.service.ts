import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, QueryFailedError, Repository } from 'typeorm';
import {
  CLOSED_SUPPORT_TICKET_MESSAGE,
  nextStatusAfterCustomerMessage,
} from './support-ticket-state';
import { StaysConversation } from '../messaging/entities/stays-conversation.entity';
import { StaysMessage } from '../messaging/entities/stays-message.entity';
import { StaysMessageAttachment } from '../messaging/entities/stays-message-attachment.entity';
import { TimelineSeederService } from '../messaging/timeline-seeder.service';
import { MessagingRealtimeService } from '../messaging/messaging-realtime.service';
import { MessagingMediaService } from '../messaging/messaging-media.service';
import { StaysBooking } from '../stays/entities/stays-booking.entity';
import { StaysListing } from '../stays/entities/stays-listing.entity';
import { StaysHostProfile } from '../stays/entities/stays-host-profile.entity';
import { StaysAuditService } from '../stays/services/stays-audit.service';
import { IdentityUserClient } from '../../common/identity/identity-user.client';
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
import { StaysSupportTicketNote } from './entities/stays-support-ticket-note.entity';
import {
  AdminListTicketsQueryDto,
  AdminListReportsQueryDto,
  CreateSupportTicketDto,
  PatchSupportTicketDto,
  PatchTrustReportDto,
  SUPPORT_TICKET_STATUSES,
  TRUST_REPORT_KINDS,
  TRUST_REPORT_STATUSES,
} from './dto/support-ticket.dto';

const OPEN_TICKET_STATUSES: SupportTicketStatus[] = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_CUSTOMER',
  'WAITING_FOR_HOST',
  'ESCALATED',
];

function isUniqueViolation(err: unknown): boolean {
  if (err instanceof QueryFailedError) {
    const driver = err.driverError as { code?: string };
    return driver?.code === '23505';
  }
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === '23505'
  );
}

const ENSURE_TICKET_FAILED = 'Failed to ensure support ticket.';

function requireTicket(
  ticket: StaysSupportTicket | null | undefined,
): StaysSupportTicket {
  if (!ticket) {
    throw new InternalServerErrorException(ENSURE_TICKET_FAILED);
  }
  return ticket;
}

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
    @InjectRepository(StaysMessageAttachment)
    private readonly attachmentRepo: Repository<StaysMessageAttachment>,
    @InjectRepository(StaysBooking)
    private readonly bookingRepo: Repository<StaysBooking>,
    @InjectRepository(StaysListing)
    private readonly listingRepo: Repository<StaysListing>,
    @InjectRepository(StaysHostProfile)
    private readonly hostProfileRepo: Repository<StaysHostProfile>,
    @InjectRepository(StaysSupportTicketNote)
    private readonly noteRepo: Repository<StaysSupportTicketNote>,
    private readonly timelineSeeder: TimelineSeederService,
    private readonly realtime: MessagingRealtimeService,
    private readonly media: MessagingMediaService,
    private readonly identityUsers: IdentityUserClient,
    private readonly staysAudit: StaysAuditService,
  ) {}

  async createReport(
    input: {
      conversationId: string;
      reporterUserId: string;
      reason?: string;
      attachmentIds?: string[];
      bookingId?: string | null;
      listingId?: string | null;
      reportedUserId?: string | null;
    },
    manager?: EntityManager,
  ): Promise<StaysConversationReport> {
    const repo = manager
      ? manager.getRepository(StaysConversationReport)
      : this.reportRepo;
    const row = repo.create({
      conversation_id: input.conversationId,
      reporter_user_id: input.reporterUserId,
      reason: input.reason?.trim() || null,
      attachment_ids: input.attachmentIds ?? [],
      status: 'OPEN',
      booking_id: input.bookingId ?? null,
      listing_id: input.listingId ?? null,
      reported_user_id: input.reportedUserId ?? null,
    });
    return repo.save(row);
  }

  async createSafetyIssue(
    input: {
      conversationId: string;
      reporterUserId: string;
      category: string;
      details?: string;
      attachmentIds?: string[];
      bookingId?: string | null;
      listingId?: string | null;
      reportedUserId?: string | null;
    },
    manager?: EntityManager,
  ): Promise<StaysSafetyIssue> {
    const repo = manager
      ? manager.getRepository(StaysSafetyIssue)
      : this.safetyRepo;
    const row = repo.create({
      conversation_id: input.conversationId,
      reporter_user_id: input.reporterUserId,
      category: input.category,
      details: input.details?.trim() || null,
      attachment_ids: input.attachmentIds ?? [],
      status: 'OPEN',
      booking_id: input.bookingId ?? null,
      listing_id: input.listingId ?? null,
      reported_user_id: input.reportedUserId ?? null,
    });
    return repo.save(row);
  }

  /**
   * Atomically create a conversation report + Support ticket + SUPPORT thread.
   * Failure rolls back all newly created rows (no orphan canonical report).
   */
  async provisionReportWithTicket(input: {
    conversationId: string;
    reporterUserId: string;
    reason?: string;
    attachmentIds?: string[];
    bookingId?: string | null;
    listingId?: string | null;
    reportedUserId?: string | null;
    sourceConversation: StaysConversation;
  }): Promise<{
    report: StaysConversationReport;
    ticket: StaysSupportTicket;
  }> {
    const result = await this.dataSource.transaction(async (manager) => {
      const report = await this.createReport(
        {
          conversationId: input.conversationId,
          reporterUserId: input.reporterUserId,
          reason: input.reason,
          attachmentIds: input.attachmentIds,
          bookingId: input.bookingId,
          listingId: input.listingId,
          reportedUserId: input.reportedUserId,
        },
        manager,
      );
      const ticket = await this.ensureTicketForReport({
        report,
        sourceConversation: input.sourceConversation,
        manager,
      });
      return { report, ticket };
    });
    this.realtime.publish(input.reporterUserId, {
      conversationId: result.ticket.conversation_id,
      reason: 'MESSAGE_CREATED',
    });
    return result;
  }

  /**
   * Atomically create a safety issue + Support ticket + SUPPORT thread.
   * Failure rolls back all newly created rows (no orphan canonical safety row).
   */
  async provisionSafetyIssueWithTicket(input: {
    conversationId: string;
    reporterUserId: string;
    category: string;
    details?: string;
    attachmentIds?: string[];
    bookingId?: string | null;
    listingId?: string | null;
    reportedUserId?: string | null;
    sourceConversation: StaysConversation;
  }): Promise<{
    safety: StaysSafetyIssue;
    ticket: StaysSupportTicket;
  }> {
    const result = await this.dataSource.transaction(async (manager) => {
      const safety = await this.createSafetyIssue(
        {
          conversationId: input.conversationId,
          reporterUserId: input.reporterUserId,
          category: input.category,
          details: input.details,
          attachmentIds: input.attachmentIds,
          bookingId: input.bookingId,
          listingId: input.listingId,
          reportedUserId: input.reportedUserId,
        },
        manager,
      );
      const ticket = await this.ensureTicketForSafetyIssue({
        safety,
        sourceConversation: input.sourceConversation,
        manager,
      });
      return { safety, ticket };
    });
    this.realtime.publish(input.reporterUserId, {
      conversationId: result.ticket.conversation_id,
      reason: 'MESSAGE_CREATED',
    });
    return result;
  }

  /**
   * Opens an ops Support Ticket for a conversation report so it appears in
   * the admin Support queue without requiring a separate Contact Support step.
   * When `manager` is provided, participates in the caller's transaction
   * (no nested independent TX).
   * Always returns a valid ticket or throws — never null.
   */
  async ensureTicketForReport(input: {
    report: StaysConversationReport;
    sourceConversation: StaysConversation;
    manager?: EntityManager;
  }): Promise<StaysSupportTicket> {
    const ticketRepo = input.manager
      ? input.manager.getRepository(StaysSupportTicket)
      : this.ticketRepo;
    const existing = await ticketRepo.findOne({
      where: { report_id: input.report.id },
    });
    if (existing) return existing;

    const party = this.partyFromConversation(
      input.sourceConversation,
      input.report.reporter_user_id,
    );
    const reason =
      input.report.reason?.trim() || 'Conversation reported by customer';
    const subject = reason.slice(0, 120) || 'Conversation report';

    try {
      const created = await this.createTicketForUser(
        input.report.reporter_user_id,
        {
          category: 'OTHER',
          subject,
          message: reason,
          reportId: input.report.id,
          ...(input.sourceConversation.booking_id
            ? { bookingId: input.sourceConversation.booking_id }
            : {}),
          ...(input.sourceConversation.listing_id
            ? { listingId: input.sourceConversation.listing_id }
            : {}),
        },
        { party, manager: input.manager },
      );
      return requireTicket(
        await ticketRepo.findOne({ where: { id: created.id } }),
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        // createTicketForUser already rolled back the failed insert via
        // savepoint (nested) or aborted standalone TX; outer TX is still usable.
        return requireTicket(
          await ticketRepo.findOne({
            where: { report_id: input.report.id },
          }),
        );
      }
      throw err;
    }
  }

  /**
   * Opens an ops Support Ticket for a safety issue so agents can action it.
   * When `manager` is provided, participates in the caller's transaction.
   * Always returns a valid ticket or throws — never null.
   */
  async ensureTicketForSafetyIssue(input: {
    safety: StaysSafetyIssue;
    sourceConversation: StaysConversation;
    manager?: EntityManager;
  }): Promise<StaysSupportTicket> {
    const ticketRepo = input.manager
      ? input.manager.getRepository(StaysSupportTicket)
      : this.ticketRepo;
    const existing = await ticketRepo.findOne({
      where: { safety_issue_id: input.safety.id },
    });
    if (existing) return existing;

    const party = this.partyFromConversation(
      input.sourceConversation,
      input.safety.reporter_user_id,
    );
    const details = input.safety.details?.trim();
    const message = details
      ? `[${input.safety.category}] ${details}`
      : `[${input.safety.category}] Safety issue reported`;
    const subject = message.slice(0, 120);

    try {
      const created = await this.createTicketForUser(
        input.safety.reporter_user_id,
        {
          category: 'FRAUD',
          subject,
          message,
          safetyIssueId: input.safety.id,
          ...(input.sourceConversation.booking_id
            ? { bookingId: input.sourceConversation.booking_id }
            : {}),
          ...(input.sourceConversation.listing_id
            ? { listingId: input.sourceConversation.listing_id }
            : {}),
        },
        { party, priority: 'HIGH', manager: input.manager },
      );
      return requireTicket(
        await ticketRepo.findOne({ where: { id: created.id } }),
      );
    } catch (err) {
      if (isUniqueViolation(err)) {
        return requireTicket(
          await ticketRepo.findOne({
            where: { safety_issue_id: input.safety.id },
          }),
        );
      }
      throw err;
    }
  }

  /**
   * Unique violations abort the PostgreSQL transaction. Isolate ticket inserts
   * in a savepoint so callers can safely reuse an existing row on 23505.
   */
  private async withUniqueConflictSavepoint<T>(
    manager: EntityManager,
    work: () => Promise<T>,
  ): Promise<T> {
    const sp = `sp_support_ticket_${Date.now().toString(36)}`;
    await manager.query(`SAVEPOINT ${sp}`);
    try {
      const result = await work();
      await manager.query(`RELEASE SAVEPOINT ${sp}`);
      return result;
    } catch (err) {
      await manager.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      throw err;
    }
  }

  private partyFromConversation(
    conversation: StaysConversation,
    reporterUserId: string,
  ): SupportTicketParty {
    if (conversation.host_user_id === reporterUserId) return 'HOST';
    return 'GUEST';
  }

  async createTicketForUser(
    userId: string,
    dto: CreateSupportTicketDto,
    options: {
      party?: SupportTicketParty;
      customerName?: string | null;
      priority?: SupportTicketPriority;
      /** When set, join this TX (no nested dataSource.transaction / no SSE). */
      manager?: EntityManager;
    } = {},
  ) {
    const ticketRepo = options.manager
      ? options.manager.getRepository(StaysSupportTicket)
      : this.ticketRepo;

    if (dto.reportId) {
      const existing = await ticketRepo.findOne({
        where: { report_id: dto.reportId, requester_user_id: userId },
      });
      if (existing) {
        return {
          id: existing.id,
          ticket_number: existing.ticket_number,
          conversation_id: existing.conversation_id,
          status: existing.status,
          category: existing.category,
          subject: existing.subject,
          party: existing.party,
          created_at: existing.created_at.toISOString(),
        };
      }
    }
    if (dto.safetyIssueId) {
      const existing = await ticketRepo.findOne({
        where: {
          safety_issue_id: dto.safetyIssueId,
          requester_user_id: userId,
        },
      });
      if (existing) {
        return {
          id: existing.id,
          ticket_number: existing.ticket_number,
          conversation_id: existing.conversation_id,
          status: existing.status,
          category: existing.category,
          subject: existing.subject,
          party: existing.party,
          created_at: existing.created_at.toISOString(),
        };
      }
    }

    const party = options.party ?? (await this.resolveParty(userId));
    const links = await this.resolveOwnedLinks(
      userId,
      party,
      dto,
      options.manager,
    );
    const identity = await this.identityUsers.getProfileSummary(userId);
    const customerName = options.customerName?.trim() || identity?.fullName || null;
    const requesterEmail = identity?.email || null;

    const insertTicket = async (manager: EntityManager) => {
      const ticketNumber = await this.allocateTicketNumber(manager);
      const subject = dto.subject.trim();
      const conversation = await this.createSupportConversation(
        manager,
        userId,
        party,
        links.listingId,
        {
          subject,
          ticketNumber,
        },
      );

      const preview = dto.message.trim().slice(0, 200);
      const ticket = manager.getRepository(StaysSupportTicket).create({
        ticket_number: ticketNumber,
        requester_user_id: userId,
        party,
        category: dto.category as SupportTicketCategory,
        subject,
        status: 'OPEN',
        priority: options.priority ?? 'NORMAL',
        assigned_admin_id: null,
        conversation_id: conversation.id,
        booking_id: links.bookingId,
        listing_id: links.listingId,
        report_id: links.reportId,
        safety_issue_id: links.safetyIssueId,
        unread_for_support: true,
        last_message_preview: preview,
        customer_name: customerName,
        requester_email: requesterEmail,
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
        senderDisplayName: customerName ?? 'Customer',
      });

      return savedTicket;
    };

    const toCreatedDto = (created: StaysSupportTicket) => ({
      id: created.id,
      ticket_number: created.ticket_number,
      conversation_id: created.conversation_id,
      status: created.status,
      category: created.category,
      subject: created.subject,
      party: created.party,
      created_at: created.created_at.toISOString(),
    });

    const reuseAfterUnique = async (manager?: EntityManager) => {
      const repo = manager
        ? manager.getRepository(StaysSupportTicket)
        : this.ticketRepo;
      if (dto.reportId) {
        const existing = await repo.findOne({
          where: { report_id: dto.reportId, requester_user_id: userId },
        });
        if (existing) return toCreatedDto(existing);
      }
      if (dto.safetyIssueId) {
        const existing = await repo.findOne({
          where: {
            safety_issue_id: dto.safetyIssueId,
            requester_user_id: userId,
          },
        });
        if (existing) return toCreatedDto(existing);
      }
      return null;
    };

    let created: StaysSupportTicket;
    try {
      if (options.manager) {
        // Nested in an outer TX: isolate 23505 with a savepoint so the outer
        // transaction stays usable for conflict reuse.
        created = await this.withUniqueConflictSavepoint(
          options.manager,
          () => insertTicket(options.manager!),
        );
      } else {
        created = await this.dataSource.transaction((manager) =>
          insertTicket(manager),
        );
      }
    } catch (err) {
      if (isUniqueViolation(err)) {
        const reused = await reuseAfterUnique(options.manager);
        if (reused) return reused;
        throw new InternalServerErrorException(ENSURE_TICKET_FAILED);
      }
      throw err;
    }

    if (!options.manager) {
      this.realtime.publish(userId, {
        conversationId: created.conversation_id,
        reason: 'MESSAGE_CREATED',
      });
    }

    return toCreatedDto(created);
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

  async listForAdmin(query: AdminListTicketsQueryDto = {}) {
    if (query.unassigned === true && query.assignedAdminId) {
      throw new BadRequestException(
        'Cannot combine unassigned=true with assignedAdminId',
      );
    }
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const offset = Math.max(query.offset ?? 0, 0);
    const qb = this.ticketRepo
      .createQueryBuilder('t')
      .leftJoin(StaysBooking, 'b', 'b.id = t.booking_id')
      .leftJoin(StaysListing, 'l', 'l.id = t.listing_id');

    const statuses = (query.status ?? '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s): s is SupportTicketStatus =>
        (SUPPORT_TICKET_STATUSES as readonly string[]).includes(s),
      );
    if (statuses.length) {
      qb.andWhere('t.status IN (:...statuses)', { statuses });
    }
    if (query.priority) {
      qb.andWhere('t.priority = :priority', { priority: query.priority });
    }
    if (query.category) {
      qb.andWhere('t.category = :category', { category: query.category });
    }
    if (query.unassigned === true) {
      qb.andWhere('t.assigned_admin_id IS NULL');
    } else if (query.assignedAdminId) {
      qb.andWhere('t.assigned_admin_id = :assignedAdminId', {
        assignedAdminId: query.assignedAdminId,
      });
    }
    if (query.requesterUserId) {
      qb.andWhere('t.requester_user_id = :requesterUserId', {
        requesterUserId: query.requesterUserId,
      });
    }
    if (query.bookingId) {
      qb.andWhere('t.booking_id = :bookingId', { bookingId: query.bookingId });
    }
    if (query.listingId) {
      qb.andWhere('t.listing_id = :listingId', { listingId: query.listingId });
    }
    const search = query.search?.trim();
    if (search) {
      const q = `%${search.replace(/[%_]/g, '\\$&')}%`;
      qb.andWhere(
        `(t.ticket_number ILIKE :q ESCAPE '\\'
          OR t.subject ILIKE :q ESCAPE '\\'
          OR t.customer_name ILIKE :q ESCAPE '\\'
          OR t.requester_email ILIKE :q ESCAPE '\\'
          OR b.booking_reference ILIKE :q ESCAPE '\\'
          OR l.title ILIKE :q ESCAPE '\\')`,
        { q },
      );
    }

    const total = await qb.clone().getCount();
    const rows = await qb
      .orderBy('t.updated_at', 'DESC')
      .skip(offset)
      .take(limit)
      .getMany();

    await this.hydrateTicketIdentities(rows);
    const bookingRefs = await this.loadBookingRefs(
      rows.map((r) => r.booking_id).filter(Boolean) as string[],
    );
    return {
      items: rows.map((row) =>
        this.toListRow(row, bookingRefs.get(row.booking_id ?? '') ?? null),
      ),
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    };
  }

  async countOpenTicketsForAdmin(): Promise<number> {
    return this.ticketRepo
      .createQueryBuilder('t')
      .where('t.status IN (:...statuses)', { statuses: OPEN_TICKET_STATUSES })
      .getCount();
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

  async patchForAdmin(
    ticketId: string,
    patch: PatchSupportTicketDto,
    actorUserId?: string,
  ) {
    if (patch.assigned_admin_id) {
      const authz = await this.identityUsers.getAuthz(patch.assigned_admin_id);
      if (!authz) {
        throw new NotFoundException('Admin user not found');
      }
      if (authz.account_type !== 'ADMIN') {
        throw new UnprocessableEntityException(
          'Assignee must be an ADMIN account',
        );
      }
    }

    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const fromStatus = ticket.status;
    const fromPriority = ticket.priority;
    const fromAdminId = ticket.assigned_admin_id;

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

    const actor = actorUserId ?? 'system';
    if (patch.assigned_admin_id !== undefined) {
      await this.staysAudit.log({
        actorUserId: actor,
        actorRole: 'ADMIN',
        entityType: 'support_ticket',
        entityId: saved.id,
        action: 'support_ticket_assigned',
        metadata: {
          fromAdminId: fromAdminId,
          toAdminId: saved.assigned_admin_id,
        },
      });
    }
    if (patch.status !== undefined && patch.status !== fromStatus) {
      await this.staysAudit.log({
        actorUserId: actor,
        actorRole: 'ADMIN',
        entityType: 'support_ticket',
        entityId: saved.id,
        action: 'ticket_status_changed',
        metadata: { from: fromStatus, to: saved.status },
      });
    }
    if (patch.priority !== undefined && patch.priority !== fromPriority) {
      await this.staysAudit.log({
        actorUserId: actor,
        actorRole: 'ADMIN',
        entityType: 'support_ticket',
        entityId: saved.id,
        action: 'ticket_priority_changed',
        metadata: { from: fromPriority, to: saved.priority },
      });
    }

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

    const saved = await this.dataSource.transaction(async (manager) => {
      const ticket = await manager
        .getRepository(StaysSupportTicket)
        .createQueryBuilder('t')
        .setLock('pessimistic_write')
        .where('t.id = :id', { id: ticketId })
        .getOne();
      if (!ticket) throw new NotFoundException('Ticket not found');
      if (ticket.status === 'CLOSED') {
        throw new ConflictException(CLOSED_SUPPORT_TICKET_MESSAGE);
      }

      const conv = await manager.getRepository(StaysConversation).findOne({
        where: { id: ticket.conversation_id },
      });
      if (!conv) throw new NotFoundException('Ticket not found');

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

      return {
        message,
        requesterUserId: ticket.requester_user_id,
        conversationId: conv.id,
      };
    });

    this.realtime.publish(saved.requesterUserId, {
      conversationId: saved.conversationId,
      reason: 'MESSAGE_CREATED',
      messageId: saved.message.id,
    });

    return {
      id: saved.message.id,
      sender_type: 'SUPPORT_AGENT',
      sender_id: adminUserId,
      body: trimmed,
      created_at: (saved.message.sent_at ?? saved.message.created_at).toISOString(),
    };
  }

  /**
   * Lock the SUPPORT ticket before inserting a customer message.
   * Throws 409 if CLOSED. Returns null when no ticket is linked.
   */
  async lockTicketForCustomerSend(
    manager: EntityManager,
    conversationId: string,
  ): Promise<StaysSupportTicket | null> {
    const ticket = await manager
      .getRepository(StaysSupportTicket)
      .createQueryBuilder('t')
      .setLock('pessimistic_write')
      .where('t.conversation_id = :id', { id: conversationId })
      .getOne();
    if (!ticket) return null;
    if (ticket.status === 'CLOSED') {
      throw new ConflictException(CLOSED_SUPPORT_TICKET_MESSAGE);
    }
    return ticket;
  }

  /**
   * After a customer SUPPORT message is inserted, update unread + status
   * in the same transaction. Clears resolved_at only for RESOLVED → OPEN.
   */
  async applyCustomerSupportMessageEffects(
    manager: EntityManager,
    ticket: StaysSupportTicket,
    preview: string,
  ): Promise<void> {
    const nextStatus = nextStatusAfterCustomerMessage({
      status: ticket.status,
      party: ticket.party,
    });
    const patch: Partial<StaysSupportTicket> = {
      unread_for_support: true,
      last_message_preview: preview.slice(0, 200),
      status: nextStatus,
      updated_at: new Date(),
    };
    if (ticket.status === 'RESOLVED' && nextStatus === 'OPEN') {
      patch.resolved_at = null;
    }
    await manager.getRepository(StaysSupportTicket).update(ticket.id, patch);
  }

  async listReportsForAdmin(query: AdminListReportsQueryDto = {}) {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const offset = Math.max(query.offset ?? 0, 0);
    const kind = query.kind;
    const includeReports = !kind || kind === 'conversation_reported';
    const includeSafety = !kind || kind === 'safety_issue';

    // Reports have no category column.
    if (kind === 'conversation_reported' && query.category) {
      return { items: [], total: 0, limit, offset, hasMore: false };
    }

    const reportParams: unknown[] = [];
    const safetyParams: unknown[] = [];
    const unions: string[] = [];

    const buildWhere = (
      alias: 'r' | 's',
      textExpr: string,
      push: (v: unknown) => string,
      forSafetyCategory: boolean,
    ) => {
      const parts: string[] = [];
      if (query.status) parts.push(`${alias}.status = ${push(query.status)}`);
      if (query.reporterUserId) {
        parts.push(`${alias}.reporter_user_id = ${push(query.reporterUserId)}`);
      }
      if (query.reportedUserId) {
        parts.push(`${alias}.reported_user_id = ${push(query.reportedUserId)}`);
      }
      if (query.bookingId) {
        parts.push(`${alias}.booking_id = ${push(query.bookingId)}`);
      }
      if (query.listingId) {
        parts.push(`${alias}.listing_id = ${push(query.listingId)}`);
      }
      if (forSafetyCategory && query.category) {
        parts.push(`${alias}.category = ${push(query.category)}`);
      }
      const search = query.search?.trim();
      if (search) {
        const q = `%${search.replace(/[%_]/g, '\\$&')}%`;
        const s = push(q);
        parts.push(
          `(${textExpr} ILIKE ${s} ESCAPE '\\'
            OR ${alias}.reporter_user_id ILIKE ${s} ESCAPE '\\'
            OR COALESCE(${alias}.reported_user_id, '') ILIKE ${s} ESCAPE '\\'
            OR COALESCE(b.booking_reference, '') ILIKE ${s} ESCAPE '\\'
            OR COALESCE(l.title, '') ILIKE ${s} ESCAPE '\\')`,
        );
      }
      return parts.length ? `WHERE ${parts.join(' AND ')}` : '';
    };

    if (includeReports && !query.category) {
      const where = buildWhere(
        'r',
        "COALESCE(r.reason, '')",
        (v) => {
          reportParams.push(v);
          return `$${reportParams.length}`;
        },
        false,
      );
      unions.push(`
        SELECT r.id, 'conversation_reported'::text AS kind, r.created_at
        FROM stays_conversation_reports r
        LEFT JOIN stays_bookings b ON b.id = r.booking_id
        LEFT JOIN stays_listings l ON l.id = r.listing_id
        ${where}
      `);
    }
    if (includeSafety) {
      const where = buildWhere(
        's',
        "COALESCE(s.category, '') || ' ' || COALESCE(s.details, '')",
        (v) => {
          safetyParams.push(v);
          return `$${reportParams.length + safetyParams.length}`;
        },
        true,
      );
      unions.push(`
        SELECT s.id, 'safety_issue'::text AS kind, s.created_at
        FROM stays_safety_issues s
        LEFT JOIN stays_bookings b ON b.id = s.booking_id
        LEFT JOIN stays_listings l ON l.id = s.listing_id
        ${where}
      `);
    }

    if (!unions.length) {
      return { items: [], total: 0, limit, offset, hasMore: false };
    }

    const allParams = [...reportParams, ...safetyParams];
    const unionSql = unions.join(' UNION ALL ');
    const countRows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM (${unionSql}) u`,
      allParams,
    );
    const total = Number(countRows?.[0]?.total ?? 0);

    const limitPh = `$${allParams.length + 1}`;
    const offsetPh = `$${allParams.length + 2}`;
    const pageRows: Array<{ id: string; kind: string }> =
      await this.dataSource.query(
        `SELECT u.id, u.kind FROM (${unionSql}) u
         ORDER BY u.created_at DESC, u.id DESC
         LIMIT ${limitPh} OFFSET ${offsetPh}`,
        [...allParams, limit, offset],
      );

    const reportIds = pageRows
      .filter((r) => r.kind === 'conversation_reported')
      .map((r) => r.id);
    const safetyIds = pageRows
      .filter((r) => r.kind === 'safety_issue')
      .map((r) => r.id);

    const [reports, safety] = await Promise.all([
      reportIds.length
        ? this.reportRepo.find({ where: { id: In(reportIds) } })
        : Promise.resolve([] as StaysConversationReport[]),
      safetyIds.length
        ? this.safetyRepo.find({ where: { id: In(safetyIds) } })
        : Promise.resolve([] as StaysSafetyIssue[]),
    ]);
    const composed = await this.composeTrustRecords(reports, safety, false);
    const byKey = new Map(
      composed.map((item) => [`${item.kind}:${item.id}`, item]),
    );
    const items = pageRows
      .map((row) => byKey.get(`${row.kind}:${row.id}`))
      .filter(Boolean);

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async getReportForAdmin(
    id: string,
    kind: (typeof TRUST_REPORT_KINDS)[number],
  ) {
    if (kind === 'conversation_reported') {
      const row = await this.reportRepo.findOne({ where: { id } });
      if (!row) throw new NotFoundException('Report not found');
      const [item] = await this.composeTrustRecords([row], [], true);
      return item;
    }
    const row = await this.safetyRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Report not found');
    const [item] = await this.composeTrustRecords([], [row], true);
    return item;
  }

  async patchReportForAdmin(
    id: string,
    patch: PatchTrustReportDto,
    actorUserId: string,
  ) {
    if (patch.kind === 'conversation_reported') {
      const row = await this.reportRepo.findOne({ where: { id } });
      if (!row) throw new NotFoundException('Report not found');
      return this.applyTrustStatus({
        kind: 'conversation_reported',
        row,
        next: patch.status,
        actorUserId,
      });
    }
    const row = await this.safetyRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Report not found');
    return this.applyTrustStatus({
      kind: 'safety_issue',
      row,
      next: patch.status,
      actorUserId,
    });
  }

  async listNotesForAdmin(ticketId: string, limit = 100) {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const take = Math.min(Math.max(limit, 1), 200);
    const rows = await this.noteRepo.find({
      where: { ticket_id: ticketId },
      order: { created_at: 'ASC', id: 'ASC' },
      take,
    });
    return {
      items: rows.map((n) => ({
        id: n.id,
        ticket_id: n.ticket_id,
        author_admin_id: n.author_admin_id,
        body: n.body,
        created_at: n.created_at.toISOString(),
      })),
    };
  }

  async createNoteForAdmin(
    ticketId: string,
    authorAdminId: string,
    body: string,
  ) {
    const trimmed = body.trim();
    if (!trimmed) throw new BadRequestException('Note body required');
    if (trimmed.length > 5000) {
      throw new BadRequestException('Note body too long');
    }
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const note = await this.noteRepo.save(
      this.noteRepo.create({
        ticket_id: ticketId,
        author_admin_id: authorAdminId,
        body: trimmed,
      }),
    );
    await this.staysAudit.log({
      actorUserId: authorAdminId,
      actorRole: 'ADMIN',
      entityType: 'support_ticket',
      entityId: ticketId,
      action: 'support_ticket_note_added',
      metadata: { ticketId, noteId: note.id },
    });
    return {
      id: note.id,
      ticket_id: note.ticket_id,
      author_admin_id: note.author_admin_id,
      body: note.body,
      created_at: note.created_at.toISOString(),
    };
  }

  async resolveEvidenceForCanonical(
    attachmentIds: string[],
    allowedIds: string[],
  ) {
    const allowed = new Set(allowedIds.filter(Boolean));
    for (const id of attachmentIds) {
      if (!allowed.has(id)) {
        throw new BadRequestException('Invalid attachment references');
      }
    }
    return this.buildEvidence(attachmentIds.filter((id) => allowed.has(id)));
  }

  private async composeTrustRecords(
    reports: StaysConversationReport[],
    safety: StaysSafetyIssue[],
    includeEvidence: boolean,
  ) {
    const reportTickets = reports.length
      ? await this.ticketRepo.find({
          where: { report_id: In(reports.map((r) => r.id)) },
        })
      : [];
    const safetyTickets = safety.length
      ? await this.ticketRepo.find({
          where: { safety_issue_id: In(safety.map((s) => s.id)) },
        })
      : [];
    const ticketByReport = new Map(
      reportTickets.filter((t) => t.report_id).map((t) => [t.report_id!, t]),
    );
    const ticketBySafety = new Map(
      safetyTickets
        .filter((t) => t.safety_issue_id)
        .map((t) => [t.safety_issue_id!, t]),
    );

    const bookingIds = [
      ...reports.map((r) => r.booking_id),
      ...safety.map((s) => s.booking_id),
    ].filter(Boolean) as string[];
    const listingIds = [
      ...reports.map((r) => r.listing_id),
      ...safety.map((s) => s.listing_id),
    ].filter(Boolean) as string[];
    const userIds = [
      ...reports.flatMap((r) => [r.reporter_user_id, r.reported_user_id]),
      ...safety.flatMap((s) => [s.reporter_user_id, s.reported_user_id]),
    ].filter(Boolean) as string[];

    const [bookings, listings, identities] = await Promise.all([
      bookingIds.length
        ? this.bookingRepo.find({
            where: { id: In(bookingIds) },
            select: ['id', 'booking_reference'],
          })
        : Promise.resolve([] as StaysBooking[]),
      listingIds.length
        ? this.listingRepo.find({
            where: { id: In(listingIds) },
            select: ['id', 'title'],
          })
        : Promise.resolve([] as StaysListing[]),
      this.loadIdentities(userIds),
    ]);
    const bookingMap = new Map(bookings.map((b) => [b.id, b]));
    const listingMap = new Map(listings.map((l) => [l.id, l]));

    const reportItems = await Promise.all(
      reports.map(async (row) => {
        const ticket = ticketByReport.get(row.id) ?? null;
        return {
          id: row.id,
          kind: 'conversation_reported' as const,
          reason: row.reason ?? undefined,
          category: undefined as string | undefined,
          status: row.status,
          created_at: row.created_at.toISOString(),
          conversation_id: row.conversation_id,
          booking_id: row.booking_id,
          listing_id: row.listing_id,
          actor_user_id: row.reporter_user_id,
          reporter: this.toPerson(row.reporter_user_id, identities, true),
          reported_user: row.reported_user_id
            ? this.toPerson(row.reported_user_id, identities, false)
            : null,
          booking: this.toBookingRef(row.booking_id, bookingMap),
          listing: this.toListingRef(row.listing_id, listingMap),
          ticket: ticket
            ? {
                id: ticket.id,
                ticket_number: ticket.ticket_number,
                status: ticket.status,
              }
            : null,
          support_ticket_id: ticket?.id,
          evidence_count: row.attachment_ids?.length ?? 0,
          ...(includeEvidence
            ? { evidence: await this.buildEvidence(row.attachment_ids ?? []) }
            : {}),
        };
      }),
    );
    const safetyItems = await Promise.all(
      safety.map(async (row) => {
        const ticket = ticketBySafety.get(row.id) ?? null;
        return {
          id: row.id,
          kind: 'safety_issue' as const,
          reason: undefined as string | undefined,
          category: row.category,
          status: row.status,
          created_at: row.created_at.toISOString(),
          conversation_id: row.conversation_id,
          booking_id: row.booking_id,
          listing_id: row.listing_id,
          actor_user_id: row.reporter_user_id,
          reporter: this.toPerson(row.reporter_user_id, identities, true),
          reported_user: row.reported_user_id
            ? this.toPerson(row.reported_user_id, identities, false)
            : null,
          booking: this.toBookingRef(row.booking_id, bookingMap),
          listing: this.toListingRef(row.listing_id, listingMap),
          ticket: ticket
            ? {
                id: ticket.id,
                ticket_number: ticket.ticket_number,
                status: ticket.status,
              }
            : null,
          support_ticket_id: ticket?.id,
          evidence_count: row.attachment_ids?.length ?? 0,
          ...(includeEvidence
            ? { evidence: await this.buildEvidence(row.attachment_ids ?? []) }
            : {}),
        };
      }),
    );

    return [...reportItems, ...safetyItems].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
  }

  private async applyTrustStatus(input: {
    kind: (typeof TRUST_REPORT_KINDS)[number];
    row: StaysConversationReport | StaysSafetyIssue;
    next: (typeof TRUST_REPORT_STATUSES)[number];
    actorUserId: string;
  }) {
    const from = input.row.status;

    if (input.next !== 'ESCALATED') {
      input.row.status = input.next;
      input.row.updated_at = new Date();
      if (input.kind === 'conversation_reported') {
        await this.reportRepo.save(input.row as StaysConversationReport);
      } else {
        await this.safetyRepo.save(input.row as StaysSafetyIssue);
      }

      const ticket =
        input.kind === 'conversation_reported'
          ? await this.ticketRepo.findOne({
              where: { report_id: input.row.id },
            })
          : await this.ticketRepo.findOne({
              where: { safety_issue_id: input.row.id },
            });

      await this.staysAudit.log({
        actorUserId: input.actorUserId,
        actorRole: 'ADMIN',
        entityType:
          input.kind === 'conversation_reported'
            ? 'conversation_report'
            : 'safety_issue',
        entityId: input.row.id,
        action: 'status_changed',
        metadata: {
          from,
          to: input.next,
          ticketId: ticket?.id ?? null,
        },
      });

      return this.getReportForAdmin(input.row.id, input.kind);
    }

    // ESCALATED: ensure ticket before status change in one TX so failure
    // cannot leave the canonical row escalated without a ticket.
    const ticketId = await this.dataSource.transaction(async (manager) => {
      const ticketRepo = manager.getRepository(StaysSupportTicket);
      const convRepo = manager.getRepository(StaysConversation);
      const reportRepo = manager.getRepository(StaysConversationReport);
      const safetyRepo = manager.getRepository(StaysSafetyIssue);

      let ticket: StaysSupportTicket | null =
        input.kind === 'conversation_reported'
          ? await ticketRepo.findOne({
              where: { report_id: input.row.id },
            })
          : await ticketRepo.findOne({
              where: { safety_issue_id: input.row.id },
            });

      if (!ticket) {
        const conv = await convRepo.findOne({
          where: { id: input.row.conversation_id },
        });
        if (!conv) {
          throw new InternalServerErrorException(ENSURE_TICKET_FAILED);
        }
        ticket =
          input.kind === 'conversation_reported'
            ? await this.ensureTicketForReport({
                report: input.row as StaysConversationReport,
                sourceConversation: conv,
                manager,
              })
            : await this.ensureTicketForSafetyIssue({
                safety: input.row as StaysSafetyIssue,
                sourceConversation: conv,
                manager,
              });
      }

      if (ticket.priority !== 'URGENT') {
        await ticketRepo.update(ticket.id, {
          priority: 'HIGH',
          updated_at: new Date(),
        });
        ticket.priority = 'HIGH';
      }

      input.row.status = 'ESCALATED';
      input.row.updated_at = new Date();
      if (input.kind === 'conversation_reported') {
        await reportRepo.save(input.row as StaysConversationReport);
      } else {
        await safetyRepo.save(input.row as StaysSafetyIssue);
      }

      return ticket.id;
    });

    await this.staysAudit.log({
      actorUserId: input.actorUserId,
      actorRole: 'ADMIN',
      entityType:
        input.kind === 'conversation_reported'
          ? 'conversation_report'
          : 'safety_issue',
      entityId: input.row.id,
      action: 'status_changed',
      metadata: {
        from,
        to: 'ESCALATED',
        ticketId,
      },
    });

    return this.getReportForAdmin(input.row.id, input.kind);
  }

  private async buildEvidence(attachmentIds: string[]) {
    if (!attachmentIds.length) return [];
    const allowed = new Set(attachmentIds);
    const rows = await this.attachmentRepo.find({
      where: { id: In(attachmentIds) },
    });
    return rows
      .filter((row) => allowed.has(row.id))
      .map((row) => {
        const signed = this.media.resolveAttachment(
          row.id,
          'full',
          row.media_version ?? 1,
        );
        return {
          id: row.id,
          url: signed.url,
          contentType: row.mime,
          filename: row.original_filename,
          createdAt: row.created_at.toISOString(),
        };
      });
  }

  private async loadIdentities(userIds: string[]) {
    const unique = [...new Set(userIds)];
    const entries = await Promise.all(
      unique.map(
        async (id) =>
          [id, await this.identityUsers.getProfileSummary(id)] as const,
      ),
    );
    return new Map(entries);
  }

  private toPerson(
    userId: string,
    identities: Map<
      string,
      Awaited<ReturnType<IdentityUserClient['getProfileSummary']>>
    >,
    includeEmail: boolean,
  ) {
    const summary = identities.get(userId);
    return {
      id: userId,
      name: summary?.fullName ?? null,
      ...(includeEmail ? { email: summary?.email ?? null } : {}),
    };
  }

  private toBookingRef(
    bookingId: string | null,
    bookings: Map<string, StaysBooking>,
  ) {
    if (!bookingId) return null;
    const row = bookings.get(bookingId);
    return row
      ? { id: row.id, reference: row.booking_reference }
      : { id: bookingId, reference: null };
  }

  private toListingRef(
    listingId: string | null,
    listings: Map<string, StaysListing>,
  ) {
    if (!listingId) return null;
    const row = listings.get(listingId);
    return row
      ? { id: row.id, title: row.title }
      : { id: listingId, title: null };
  }

  private async hydrateTicketIdentities(rows: StaysSupportTicket[]) {
    const missing = rows.filter(
      (row) => !row.customer_name || !row.requester_email,
    );
    if (!missing.length) return;
    await Promise.all(
      missing.map(async (row) => {
        const summary = await this.identityUsers.getProfileSummary(
          row.requester_user_id,
        );
        const name = summary?.fullName ?? null;
        const email = summary?.email ?? null;
        const patch: Partial<StaysSupportTicket> = {};
        if (!row.customer_name && name) {
          row.customer_name = name;
          patch.customer_name = name;
        }
        if (!row.requester_email && email) {
          row.requester_email = email;
          patch.requester_email = email;
        }
        if (Object.keys(patch).length) {
          await this.ticketRepo.update(row.id, patch);
        }
      }),
    );
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
    manager?: EntityManager,
  ): Promise<{
    bookingId: string | null;
    listingId: string | null;
    reportId: string | null;
    safetyIssueId: string | null;
  }> {
    const bookingRepo = manager
      ? manager.getRepository(StaysBooking)
      : this.bookingRepo;
    const listingRepo = manager
      ? manager.getRepository(StaysListing)
      : this.listingRepo;
    const reportRepo = manager
      ? manager.getRepository(StaysConversationReport)
      : this.reportRepo;
    const safetyRepo = manager
      ? manager.getRepository(StaysSafetyIssue)
      : this.safetyRepo;

    let bookingId: string | null = null;
    let listingId: string | null = null;

    if (dto.bookingId) {
      const booking = await bookingRepo.findOne({
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
      const listing = await listingRepo.findOne({ where: { id: dto.listingId } });
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
      const report = await reportRepo.findOne({ where: { id: dto.reportId } });
      if (!report || report.reporter_user_id !== userId) {
        throw new NotFoundException('Ticket not found');
      }
      reportId = report.id;
    }

    let safetyIssueId: string | null = null;
    if (dto.safetyIssueId) {
      const safety = await safetyRepo.findOne({ where: { id: dto.safetyIssueId } });
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
    meta: { subject: string; ticketNumber: string },
  ): Promise<StaysConversation> {
    const convRepo = manager.getRepository(StaysConversation);
    const conv = convRepo.create({
      booking_id: null,
      type: 'SUPPORT',
      messaging_state: 'ACTIVE',
      guest_visibility: 'ACTIVE',
      host_visibility: 'ACTIVE',
      reservation_snapshot: {
        listingTitle: meta.subject,
        listingId,
        bookingReference: meta.ticketNumber,
        hostDisplayName: 'Nexa Support',
        checkinDate: '',
        checkoutDate: '',
        guestCount: 0,
      },
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
      customer_name: ticket.customer_name,
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
      requester_email: ticket.requester_email,
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
