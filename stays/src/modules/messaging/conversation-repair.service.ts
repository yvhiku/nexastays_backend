import { Injectable, Logger } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { StaysBooking } from '../stays/entities/stays-booking.entity';
import { StaysListing } from '../stays/entities/stays-listing.entity';
import { StaysConversation } from './entities/stays-conversation.entity';
import { StaysMessage } from './entities/stays-message.entity';
import { TimelineSeederService } from './timeline-seeder.service';
import { ParticipantPresentationService } from './participant-presentation.service';
import { ConversationProvisionService } from './conversation-provision.service';
import { formatInboxPreview } from './message-preview.util';

const MESSAGEABLE_STATUSES = new Set(['CONFIRMED', 'CHECKED_IN', 'COMPLETED']);

type OrphanRow = { conversation_id: string };

@Injectable()
export class ConversationRepairService {
  private readonly logger = new Logger(ConversationRepairService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly timelineSeeder: TimelineSeederService,
    private readonly participants: ParticipantPresentationService,
    private readonly provision: ConversationProvisionService,
  ) {}

  /** Restore missing inbox threads for the current user (orphaned messages + missing booking threads). */
  async repairForUser(userId: string): Promise<void> {
    await this.repairOrphanedThreads(userId);
    await this.dedupeDuplicateBookingThreads(userId);
    await this.ensureMissingBookingThreads(userId);
  }

  private async repairOrphanedThreads(userId: string): Promise<void> {
    const orphans = await this.dataSource.query<OrphanRow[]>(`
      SELECT DISTINCT m.conversation_id
      FROM stays_messages m
      LEFT JOIN stays_conversations c ON c.id = m.conversation_id
      WHERE c.id IS NULL
    `);

    for (const { conversation_id: conversationId } of orphans) {
      try {
        await this.repairOrphanThread(conversationId, userId);
      } catch (err) {
        this.logger.warn(
          `Failed to repair orphaned thread ${conversationId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async repairOrphanThread(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const messageRepo = this.dataSource.getRepository(StaysMessage);
    const messages = await messageRepo.find({
      where: { conversation_id: conversationId },
      order: { conversation_sequence: 'ASC' },
    });
    if (messages.length === 0) return;

    const bookingId =
      this.resolveBookingIdFromMessages(messages) ??
      (await this.resolveBookingIdFromParticipants(messages));
    if (!bookingId) {
      this.logger.warn(`Orphan thread ${conversationId} has no booking reference`);
      return;
    }

    const bookingRepo = this.dataSource.getRepository(StaysBooking);
    const listingRepo = this.dataSource.getRepository(StaysListing);
    const booking = await bookingRepo.findOne({ where: { id: bookingId } });
    if (!booking) return;

    const listing = await listingRepo.findOne({
      where: { id: booking.listing_id },
      relations: ['media', 'check_in_contact'],
    });
    if (!listing?.host_user_id) return;

    const isParticipant =
      booking.guest_user_id === userId || listing.host_user_id === userId;
    if (!isParticipant) return;

    const existing = await this.dataSource
      .getRepository(StaysConversation)
      .findOne({ where: { booking_id: bookingId } });
    if (existing) {
      if (existing.id !== conversationId) {
        await this.mergeMessagesIntoConversation(conversationId, existing.id);
        this.logger.log(
          `Merged orphan thread ${conversationId} into booking conversation ${existing.id}`,
        );
      }
      return;
    }

    const hostName = await this.participants.resolveHostDisplayName(listing.host_user_id);
    const guestName = await this.participants.resolveGuestDisplayName(booking.id);
    const snapshot = this.timelineSeeder.buildSnapshot(booking, listing, {
      hostDisplayName: hostName,
      guestDisplayName: guestName,
    });

    const lastMessage = messages[messages.length - 1];
    const preview = formatInboxPreview({
      type: lastMessage.type,
      body: lastMessage.body,
      metadata: lastMessage.metadata,
    });

    await this.dataSource.query(
      `
      INSERT INTO stays_conversations (
        id, booking_id, type, messaging_state, guest_visibility, host_visibility,
        conversation_version, snapshot_version, attachment_version, reservation_snapshot,
        listing_id, host_user_id, guest_user_id, last_message_id, last_message_sequence,
        last_message_preview, last_message_at, created_at, updated_at
      ) VALUES (
        $1, $2, 'BOOKING', 'ACTIVE', 'ACTIVE', 'ACTIVE',
        1, 1, 1, $3::jsonb,
        $4, $5, $6, $7, $8,
        $9, $10, NOW(), NOW()
      )
      ON CONFLICT (id) DO NOTHING
      `,
      [
        conversationId,
        bookingId,
        JSON.stringify(snapshot),
        listing.id,
        listing.host_user_id,
        booking.guest_user_id,
        lastMessage.id,
        lastMessage.conversation_sequence,
        preview,
        lastMessage.created_at,
      ],
    );

    this.logger.log(`Repaired orphaned conversation ${conversationId} for booking ${bookingId}`);
  }

  private resolveBookingIdFromMessages(messages: StaysMessage[]): string | null {
    for (const message of messages) {
      const meta = message.metadata as Record<string, unknown> | null;
      const bookingId = meta?.bookingId;
      if (typeof bookingId === 'string' && bookingId.length > 0) {
        return bookingId;
      }
    }

    for (const message of messages) {
      const meta = message.metadata as Record<string, unknown> | null;
      const actions = meta?.actions;
      if (!Array.isArray(actions)) continue;
      for (const action of actions) {
        if (!action || typeof action !== 'object') continue;
        const url = (action as { url?: unknown }).url;
        if (typeof url !== 'string') continue;
        const match = /\/bookings\/([0-9a-f-]{36})/i.exec(url);
        if (match?.[1]) return match[1];
      }
    }

    return null;
  }

  private async resolveBookingIdFromParticipants(
    messages: StaysMessage[],
  ): Promise<string | null> {
    const senderIds = [
      ...new Set(
        messages
          .map((m) => m.sender_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];
    if (senderIds.length === 0) return null;

    let listingId: string | null = null;
    for (const message of messages) {
      const meta = message.metadata as Record<string, unknown> | null;
      if (typeof meta?.listingId === 'string') {
        listingId = meta.listingId;
        break;
      }
      const snapshot = meta?.snapshot as { primaryPhotoUrl?: unknown } | undefined;
      if (typeof snapshot?.primaryPhotoUrl === 'string') {
        const match = /\/listings\/([0-9a-f-]{36})\//i.exec(snapshot.primaryPhotoUrl);
        if (match?.[1]) {
          listingId = match[1];
          break;
        }
      }
    }
    if (!listingId) return null;

    const bookingRepo = this.dataSource.getRepository(StaysBooking);
    const candidates = await bookingRepo.find({
      where: { listing_id: listingId },
      order: { created_at: 'DESC' },
      take: 20,
    });

    for (const senderId of senderIds) {
      const match = candidates.find(
        (b) => MESSAGEABLE_STATUSES.has(b.status) && b.guest_user_id === senderId,
      );
      if (match) return match.id;
    }

    return null;
  }

  private async mergeMessagesIntoConversation(
    fromConversationId: string,
    toConversationId: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const messageRepo = manager.getRepository(StaysMessage);
      const convRepo = manager.getRepository(StaysConversation);

      const orphanMessages = await messageRepo.find({
        where: { conversation_id: fromConversationId },
        order: { conversation_sequence: 'ASC' },
      });
      if (orphanMessages.length === 0) {
        await convRepo.delete({ id: fromConversationId });
        return;
      }

      const maxSeqRow = await messageRepo
        .createQueryBuilder('m')
        .select('COALESCE(MAX(m.conversation_sequence), 0)', 'maxSeq')
        .where('m.conversation_id = :cid', { cid: toConversationId })
        .getRawOne<{ maxSeq: string }>();
      let nextSeq = Number(maxSeqRow?.maxSeq ?? 0);

      for (const message of orphanMessages) {
        nextSeq += 1;
        await messageRepo.update(message.id, {
          conversation_id: toConversationId,
          conversation_sequence: String(nextSeq),
        });
      }

      const lastMessage = await messageRepo.findOne({
        where: { conversation_id: toConversationId },
        order: { conversation_sequence: 'DESC' },
      });
      if (lastMessage) {
        const preview = formatInboxPreview({
          type: lastMessage.type,
          body: lastMessage.body,
          metadata: lastMessage.metadata,
        });
        await convRepo.update(toConversationId, {
          last_message_id: lastMessage.id,
          last_message_sequence: String(lastMessage.conversation_sequence),
          last_message_preview: preview,
          last_message_at: lastMessage.created_at,
        });
      }

      await convRepo.delete({ id: fromConversationId });
    });
  }

  private async dedupeDuplicateBookingThreads(userId: string): Promise<void> {
    const duplicates = await this.dataSource.query<
      { booking_id: string; conv_ids: string[] }[]
    >(
      `
      SELECT booking_id, array_agg(id ORDER BY created_at ASC) AS conv_ids
      FROM stays_conversations
      WHERE booking_id IS NOT NULL
        AND (guest_user_id = $1 OR host_user_id = $1)
      GROUP BY booking_id
      HAVING COUNT(*) > 1
      `,
      [userId],
    );

    for (const row of duplicates) {
      const [keepId, ...dropIds] = row.conv_ids;
      for (const dropId of dropIds) {
        try {
          await this.mergeMessagesIntoConversation(dropId, keepId);
          this.logger.log(
            `Deduped conversation ${dropId} into ${keepId} for booking ${row.booking_id}`,
          );
        } catch (err) {
          this.logger.warn(
            `Failed to dedupe conversation ${dropId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }

  private async ensureMissingBookingThreads(userId: string): Promise<void> {
    const bookingRepo = this.dataSource.getRepository(StaysBooking);
    const convRepo = this.dataSource.getRepository(StaysConversation);
    const listingRepo = this.dataSource.getRepository(StaysListing);

    const hostListings = await listingRepo.find({
      where: { host_user_id: userId },
      select: ['id'],
    });
    const hostListingIds = hostListings.map((l) => l.id);

    const guestBookings = await bookingRepo.find({
      where: { guest_user_id: userId },
      select: ['id', 'status'],
    });
    const hostBookings =
      hostListingIds.length > 0
        ? await bookingRepo.find({
            where: { listing_id: In(hostListingIds) },
            select: ['id', 'status'],
          })
        : [];

    const bookingIds = [...guestBookings, ...hostBookings]
      .filter((b) => MESSAGEABLE_STATUSES.has(b.status))
      .map((b) => b.id);

    if (bookingIds.length === 0) return;

    const existing = await convRepo.find({
      where: { booking_id: In(bookingIds) },
      select: ['booking_id'],
    });
    const existingIds = new Set(
      existing.map((c) => c.booking_id).filter((id): id is string => !!id),
    );

    for (const bookingId of bookingIds) {
      if (existingIds.has(bookingId)) continue;
      try {
        await this.provision.ensureForBooking(bookingId, userId);
      } catch (err) {
        this.logger.warn(
          `Could not provision conversation for booking ${bookingId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
