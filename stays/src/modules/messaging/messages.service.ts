import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, LessThan } from 'typeorm';
import { StaysConversation } from './entities/stays-conversation.entity';
import { StaysMessage } from './entities/stays-message.entity';
import { MessagingPermissionsService } from './permissions.service';
import { MessagingRateLimitService } from './rate-limit.service';
import { TimelineSeederService } from './timeline-seeder.service';
import { MessagingOutboxService } from './outbox.service';
import type { MessageDto } from './messaging.types';
import { EVENTS } from '@nexa/event-bus';

@Injectable()
export class MessagesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(StaysConversation)
    private readonly convRepo: Repository<StaysConversation>,
    @InjectRepository(StaysMessage)
    private readonly messageRepo: Repository<StaysMessage>,
    private readonly permissions: MessagingPermissionsService,
    private readonly rateLimit: MessagingRateLimitService,
    private readonly timelineSeeder: TimelineSeederService,
    private readonly outbox: MessagingOutboxService,
  ) {}

  async listMessages(
    conversationId: string,
    userId: string,
    limit = 30,
    beforeSequence?: number,
  ): Promise<{ messages: MessageDto[]; hasMore: boolean }> {
    const conv = await this.getParticipantConversation(conversationId, userId);
    const take = Math.min(Math.max(limit, 1), 50);

    const qb = this.messageRepo
      .createQueryBuilder('m')
      .where('m.conversation_id = :id', { id: conv.id })
      .andWhere("m.type != 'SYSTEM_INTERNAL'")
      .andWhere('m.deleted_at IS NULL')
      .orderBy('m.conversation_sequence', 'DESC')
      .take(take + 1);

    if (beforeSequence != null) {
      qb.andWhere('m.conversation_sequence < :seq', { seq: beforeSequence });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > take;
    const slice = hasMore ? rows.slice(0, take) : rows;
    slice.reverse();

    // Mark delivered for recipient
    const isGuest = conv.guest_user_id === userId;
    const unreadFromOther = slice.filter(
      (m) => m.sender_id && m.sender_id !== userId && m.status !== 'READ',
    );
    if (unreadFromOther.length > 0) {
      await this.messageRepo
        .createQueryBuilder()
        .update(StaysMessage)
        .set({ status: 'DELIVERED', delivered_at: new Date() })
        .where('id IN (:...ids)', { ids: unreadFromOther.map((m) => m.id) })
        .andWhere("status = 'PERSISTED'")
        .execute();
    }

    return {
      messages: slice.map((m) => this.toDto(m, userId)),
      hasMore,
    };
  }

  async sendText(
    conversationId: string,
    userId: string,
    body: string,
    clientMessageId?: string,
  ): Promise<MessageDto> {
    const trimmed = body?.trim();
    if (!trimmed) throw new BadRequestException('Message body required');
    if (trimmed.length > 2000) throw new BadRequestException('Message too long');

    const conv = await this.getParticipantConversation(conversationId, userId);
    const perms = this.permissions.resolve(conv, userId);
    if (!perms.canSend) throw new ForbiddenException('Cannot send messages');

    if (clientMessageId) {
      const existing = await this.messageRepo.findOne({
        where: { conversation_id: conv.id, client_message_id: clientMessageId },
      });
      if (existing) return this.toDto(existing, userId);
    }

    await this.rateLimit.assertCanSend(userId, conv.id, trimmed);

    const saved = await this.dataSource.transaction(async (manager) => {
      const message = await this.timelineSeeder.insertMessage(manager, conv, {
        type: 'TEXT',
        body: trimmed,
        metadata: { source: 'USER', schemaVersion: 1, cardVersion: 1 },
        senderId: userId,
        clientMessageId: clientMessageId ?? null,
      });

      const refreshed = await manager.getRepository(StaysConversation).findOne({
        where: { id: conv.id },
      });

      const recipientId =
        userId === conv.guest_user_id ? conv.host_user_id : conv.guest_user_id;

      if (recipientId) {
        await this.outbox.enqueue(manager, EVENTS.MESSAGE_RECEIVED, {
          messageId: message.id,
          conversationId: conv.id,
          recipientUserId: recipientId,
          senderUserId: userId,
          preview: trimmed.slice(0, 120),
          bookingId: conv.booking_id,
          conversationVersion: refreshed?.conversation_version ?? conv.conversation_version + 1,
          lastMessageId: message.id,
          lastMessageSequence: Number(message.conversation_sequence),
          listingTitle:
            (conv.reservation_snapshot as { listingTitle?: string })?.listingTitle ?? '',
        });
      }

      await this.outbox.enqueue(manager, EVENTS.MESSAGE_SENT, {
        messageId: message.id,
        conversationId: conv.id,
        senderUserId: userId,
      });

      // Resurface archived for recipient
      const visField =
        userId === conv.guest_user_id ? 'host_visibility' : 'guest_visibility';
      await manager
        .getRepository(StaysConversation)
        .createQueryBuilder()
        .update()
        .set({ [visField]: 'ACTIVE' })
        .where('id = :id', { id: conv.id })
        .andWhere(`${visField} = 'ARCHIVED'`)
        .execute();

      return message;
    });

    return this.toDto(saved, userId);
  }

  async markRead(conversationId: string, userId: string): Promise<void> {
    const conv = await this.getParticipantConversation(conversationId, userId);
    const isGuest = conv.guest_user_id === userId;
    const now = new Date();

    const lastMsg = conv.last_message_id
      ? await this.messageRepo.findOne({ where: { id: conv.last_message_id } })
      : null;

    await this.dataSource.transaction(async (manager) => {
      const convRepo = manager.getRepository(StaysConversation);
      const msgRepo = manager.getRepository(StaysMessage);

      if (isGuest) {
        await convRepo.update(conv.id, {
          guest_last_read_at: now,
          guest_last_read_message_id: lastMsg?.id ?? null,
          unread_guest: 0,
          conversation_version: conv.conversation_version + 1,
        });
      } else {
        await convRepo.update(conv.id, {
          host_last_read_at: now,
          host_last_read_message_id: lastMsg?.id ?? null,
          unread_host: 0,
          conversation_version: conv.conversation_version + 1,
        });
      }

      await msgRepo
        .createQueryBuilder()
        .update(StaysMessage)
        .set({ status: 'READ', read_at: now })
        .where('conversation_id = :cid', { cid: conv.id })
        .andWhere('sender_id IS NOT NULL')
        .andWhere('sender_id != :uid', { uid: userId })
        .andWhere('read_at IS NULL')
        .execute();

      await this.outbox.enqueue(manager, EVENTS.MESSAGE_READ, {
        conversationId: conv.id,
        readerUserId: userId,
      });
    });
  }

  private async getParticipantConversation(
    conversationId: string,
    userId: string,
  ): Promise<StaysConversation> {
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv || !this.permissions.isParticipant(conv, userId)) {
      throw new NotFoundException('Conversation not found');
    }
    return conv;
  }

  private toDto(message: StaysMessage, userId: string): MessageDto {
    return {
      id: message.id,
      conversationId: message.conversation_id,
      conversationSequence: Number(message.conversation_sequence),
      senderId: message.sender_id,
      type: message.type,
      body: message.body,
      metadata: message.metadata ?? {},
      status: message.status,
      sentAt: message.sent_at?.toISOString() ?? null,
      deliveredAt: message.delivered_at?.toISOString() ?? null,
      readAt: message.read_at?.toISOString() ?? null,
      isSystem: message.is_system,
      clientMessageId: message.client_message_id,
      createdAt: message.created_at.toISOString(),
      isOwn: message.sender_id === userId,
    };
  }
}
