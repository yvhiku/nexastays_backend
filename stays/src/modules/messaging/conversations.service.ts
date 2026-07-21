import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { StaysConversation } from './entities/stays-conversation.entity';
import { StaysBooking } from '../stays/entities/stays-booking.entity';
import { MessagingPermissionsService } from './permissions.service';
import { MessagesService } from './messages.service';
import { MessagingAuditService } from './audit.service';
import { ConversationProvisionService } from './conversation-provision.service';
import type {
  ConversationDetail,
  ConversationListItem,
  ReservationSnapshot,
} from './messaging.types';

@Injectable()
export class ConversationsService {
  constructor(
    @InjectRepository(StaysConversation)
    private readonly convRepo: Repository<StaysConversation>,
    @InjectRepository(StaysBooking)
    private readonly bookingRepo: Repository<StaysBooking>,
    private readonly permissions: MessagingPermissionsService,
    private readonly messagesService: MessagesService,
    private readonly audit: MessagingAuditService,
    private readonly conversationProvision: ConversationProvisionService,
  ) {}

  async listConversations(
    userId: string,
    filter: string = 'all',
    q?: string,
  ): Promise<ConversationListItem[]> {
    const qb = this.convRepo
      .createQueryBuilder('c')
      .where(
        new Brackets((w) => {
          w.where('c.guest_user_id = :uid', { uid: userId }).orWhere(
            'c.host_user_id = :uid',
            { uid: userId },
          );
        }),
      );

    if (filter === 'unread') {
      qb.andWhere(
        new Brackets((w) => {
          w.where(
            '(c.guest_user_id = :uid AND c.unread_guest > 0)',
          ).orWhere('(c.host_user_id = :uid AND c.unread_host > 0)');
        }),
      );
    } else if (filter === 'hosts') {
      qb.andWhere('c.type = :t', { t: 'BOOKING' });
    } else if (filter === 'support') {
      qb.andWhere('c.type = :t', { t: 'SUPPORT' });
    }

    if (q?.trim()) {
      const term = `%${q.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('LOWER(c.last_message_preview) LIKE :term', { term })
            .orWhere("LOWER(c.reservation_snapshot->>'listingTitle') LIKE :term", { term })
            .orWhere("LOWER(c.reservation_snapshot->>'hostDisplayName') LIKE :term", { term })
            .orWhere("LOWER(c.reservation_snapshot->>'guestDisplayName') LIKE :term", { term })
            .orWhere("LOWER(c.reservation_snapshot->>'bookingReference') LIKE :term", { term })
            .orWhere(
              `EXISTS (
                SELECT 1 FROM stays_messages sm
                WHERE sm.conversation_id = c.id
                  AND sm.deleted_at IS NULL
                  AND sm.type = 'TEXT'
                  AND LOWER(sm.body) LIKE :term
              )`,
            );
        }),
      );
    }

    qb.orderBy(
      `CASE WHEN (c.guest_user_id = :uid AND c.unread_guest > 0) OR (c.host_user_id = :uid AND c.unread_host > 0) THEN 0 ELSE 1 END`,
      'ASC',
    );
    qb.addOrderBy('c.last_message_at', 'DESC', 'NULLS LAST');
    qb.addOrderBy(
      `CASE WHEN c.messaging_state = 'ARCHIVED' THEN 1 ELSE 0 END`,
      'ASC',
    );

    const rows = await qb.getMany();
    return rows
      .filter((c) => this.permissions.visibilityFor(c, userId) !== 'DELETED')
      .filter((c) => {
        const vis = this.permissions.visibilityFor(c, userId);
        if (filter === 'all') return vis !== 'ARCHIVED' || this.hasUnread(c, userId);
        return true;
      })
      .map((c) => this.toListItem(c, userId));
  }

  async getUnreadCount(userId: string): Promise<number> {
    const rows = await this.convRepo.find({
      where: [{ guest_user_id: userId }, { host_user_id: userId }],
    });
    return rows.reduce((sum, c) => {
      if (this.permissions.visibilityFor(c, userId) === 'DELETED') return sum;
      if (c.guest_user_id === userId) return sum + (c.unread_guest ?? 0);
      if (c.host_user_id === userId) return sum + (c.unread_host ?? 0);
      return sum;
    }, 0);
  }

  async getConversationByBooking(
    bookingId: string,
    userId: string,
  ): Promise<ConversationListItem | null> {
    const conv = await this.convRepo.findOne({ where: { booking_id: bookingId } });
    if (!conv || !this.permissions.isParticipant(conv, userId)) return null;
    if (this.permissions.visibilityFor(conv, userId) === 'DELETED') return null;
    return this.toListItem(conv, userId);
  }

  async ensureConversationForBooking(
    bookingId: string,
    userId: string,
  ): Promise<ConversationListItem> {
    const conv = await this.conversationProvision.ensureForBooking(
      bookingId,
      userId,
    );
    return this.toListItem(conv, userId);
  }

  async getConversation(
    conversationId: string,
    userId: string,
    beforeSequence?: number,
  ): Promise<ConversationDetail> {
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv || !this.permissions.isParticipant(conv, userId)) {
      throw new NotFoundException('Conversation not found');
    }
    if (this.permissions.visibilityFor(conv, userId) === 'DELETED') {
      throw new NotFoundException('Conversation not found');
    }

    const { messages, hasMore } = await this.messagesService.listMessages(
      conversationId,
      userId,
      30,
      beforeSequence,
    );

    let bookingStatus: string | null = null;
    if (conv.booking_id) {
      const booking = await this.bookingRepo.findOne({ where: { id: conv.booking_id } });
      bookingStatus = booking?.status ?? null;
    }

    const item = this.toListItem(conv, userId);
    return {
      ...item,
      bookingId: conv.booking_id,
      bookingStatus,
      messages,
      hasMore,
    };
  }

  async updateVisibility(
    conversationId: string,
    userId: string,
    action: 'archive' | 'delete' | 'restore',
  ): Promise<{ conversationVersion: number }> {
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv || !this.permissions.isParticipant(conv, userId)) {
      throw new NotFoundException('Conversation not found');
    }
    const perms = this.permissions.resolve(conv, userId);
    if (action === 'archive' && !perms.canArchive) throw new ForbiddenException();
    if (action === 'delete' && !perms.canDelete) throw new ForbiddenException();

    const isGuest = conv.guest_user_id === userId;
    const field = isGuest ? 'guest_visibility' : 'host_visibility';
    let value: 'ACTIVE' | 'ARCHIVED' | 'DELETED' = 'ACTIVE';
    if (action === 'archive') value = 'ARCHIVED';
    if (action === 'delete') value = 'DELETED';

    const nextVersion = conv.conversation_version + 1;
    await this.convRepo.update(conv.id, {
      [field]: value,
      conversation_version: nextVersion,
    });
    await this.audit.log(`visibility_${action}`, conv.id, userId, { field, value });
    return { conversationVersion: nextVersion };
  }

  async report(conversationId: string, userId: string, reason?: string): Promise<void> {
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv || !this.permissions.isParticipant(conv, userId)) {
      throw new NotFoundException('Conversation not found');
    }
    await this.audit.log('conversation_reported', conv.id, userId, { reason: reason ?? '' });
  }

  async block(conversationId: string, userId: string): Promise<void> {
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv || !this.permissions.isParticipant(conv, userId)) {
      throw new NotFoundException('Conversation not found');
    }
    const isGuest = conv.guest_user_id === userId;
    await this.convRepo.update(conv.id, {
      ...(isGuest ? { blocked_by_guest: true } : { blocked_by_host: true }),
      messaging_state: 'LOCKED',
      locked_at: new Date(),
      conversation_version: conv.conversation_version + 1,
    });
    await this.audit.log('user_blocked', conv.id, userId, {});
  }

  async safety(conversationId: string, userId: string): Promise<{ supportUrl: string }> {
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv || !this.permissions.isParticipant(conv, userId)) {
      throw new NotFoundException('Conversation not found');
    }
    await this.audit.log('safety_issue', conv.id, userId, {});
    return { supportUrl: '/contact?safety=1' };
  }

  private hasUnread(c: StaysConversation, userId: string): boolean {
    if (c.guest_user_id === userId) return (c.unread_guest ?? 0) > 0;
    if (c.host_user_id === userId) return (c.unread_host ?? 0) > 0;
    return false;
  }

  private toListItem(conv: StaysConversation, userId: string): ConversationListItem {
    const isGuest = conv.guest_user_id === userId;
    const snapshot = conv.reservation_snapshot as unknown as ReservationSnapshot;
    const unread = isGuest ? conv.unread_guest : conv.unread_host;
    const counterpartName = isGuest
      ? snapshot.hostDisplayName ?? 'Host'
      : snapshot.guestDisplayName ?? 'Guest';

    return {
      id: conv.id,
      type: conv.type,
      messagingState: conv.messaging_state,
      visibility: this.permissions.visibilityFor(conv, userId),
      conversationVersion: conv.conversation_version,
      lastMessageSequence: Number(conv.last_message_sequence ?? 0),
      unreadCount: unread ?? 0,
      counterpart: {
        name: counterpartName,
        avatarUrl: null,
        isSuperhost: false,
      },
      listing: {
        title: snapshot.listingTitle ?? 'Stay',
        city: null,
      },
      lastMessage: {
        preview: conv.last_message_preview,
        at: conv.last_message_at?.toISOString() ?? null,
      },
      reservationSnapshot: snapshot,
      permissions: this.permissions.resolve(conv, userId),
    };
  }
}
