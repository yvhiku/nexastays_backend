import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StaysConversation, ArchiveReason } from './entities/stays-conversation.entity';
import { StaysMessage } from './entities/stays-message.entity';
import { StaysBooking } from '../stays/entities/stays-booking.entity';
import { StaysListing } from '../stays/entities/stays-listing.entity';
import { TimelineSeederService } from './timeline-seeder.service';
import { DomainEventsService } from '../../common/events/domain-events.service';
import { EVENTS } from '@nexa/event-bus';

function parseCheckoutDateTime(
  checkoutDate: Date | string,
  checkoutTime: string,
): Date {
  const dateStr =
    checkoutDate instanceof Date
      ? checkoutDate.toISOString().slice(0, 10)
      : String(checkoutDate).slice(0, 10);
  const [hourPart, minutePart] = checkoutTime.split(':');
  const hours = Number(hourPart) || 11;
  const minutes = Number(minutePart) || 0;
  return new Date(
    `${dateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`,
  );
}

@Injectable()
export class MessagingStateService {
  private readonly logger = new Logger(MessagingStateService.name);

  constructor(
    @InjectRepository(StaysConversation)
    private readonly convRepo: Repository<StaysConversation>,
    @InjectRepository(StaysBooking)
    private readonly bookingRepo: Repository<StaysBooking>,
    @InjectRepository(StaysListing)
    private readonly listingRepo: Repository<StaysListing>,
    private readonly dataSource: DataSource,
    private readonly timelineSeeder: TimelineSeederService,
    private readonly domainEvents: DomainEventsService,
  ) {}

  getPostStayGraceHours(): number {
    const raw = Number(process.env.POST_STAY_GRACE_HOURS ?? 72);
    return Number.isFinite(raw) && raw > 0 ? raw : 72;
  }

  computePostStayEndsAt(booking: StaysBooking, listing?: StaysListing | null): Date {
    const checkoutAt =
      booking.completed_at ??
      parseCheckoutDateTime(booking.checkout_date, listing?.checkout_time ?? '11:00');
    const graceMs = this.getPostStayGraceHours() * 60 * 60 * 1000;
    return new Date(checkoutAt.getTime() + graceMs);
  }

  /** Sync booking status → conversation state (cancel lock, post-stay entry, overdue archive). */
  async syncFromBooking(bookingId: string): Promise<void> {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: ['listing'],
    });
    const conv = await this.convRepo.findOne({ where: { booking_id: bookingId } });
    if (!booking || !conv) return;

    const now = new Date();
    if (
      booking.status === 'CANCELLED_BY_GUEST' ||
      booking.status === 'CANCELLED_BY_HOST'
    ) {
      await this.convRepo.update(conv.id, {
        messaging_state: 'LOCKED',
        locked_at: conv.locked_at ?? now,
        conversation_version: conv.conversation_version + 1,
      });
      return;
    }

    if (booking.status === 'COMPLETED') {
      if (conv.messaging_state === 'ARCHIVED') return;
      if (conv.post_stay_ends_at && conv.post_stay_ends_at <= now && !conv.auto_archive_disabled) {
        await this.archiveConversation(conv.id, 'AUTO');
        return;
      }
      await this.enterPostStay(bookingId);
    }
  }

  /** Checkout → post-stay: chat stays active until post_stay_ends_at. */
  async enterPostStay(bookingId: string): Promise<void> {
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
    const conv = await this.convRepo.findOne({ where: { booking_id: bookingId } });
    if (!booking || !conv || booking.status !== 'COMPLETED') return;
    if (conv.messaging_state === 'ACTIVE' && conv.post_stay_ends_at) return;

    const listing = booking.listing_id
      ? await this.listingRepo.findOne({ where: { id: booking.listing_id } })
      : null;
    const postStayEndsAt = this.computePostStayEndsAt(booking, listing);

    await this.dataSource.transaction(async (manager) => {
      const messageRepo = manager.getRepository(StaysMessage);
      const convRepo = manager.getRepository(StaysConversation);

      const hasReviewCard = await messageRepo.exists({
        where: { conversation_id: conv.id, type: 'REVIEW_CARD' },
      });
      if (!hasReviewCard) {
        await this.timelineSeeder.seedCheckoutComplete(manager, conv, booking);
      }

      await convRepo.update(conv.id, {
        messaging_state: 'ACTIVE',
        guest_visibility: 'ACTIVE',
        host_visibility: 'ACTIVE',
        post_stay_ends_at: postStayEndsAt,
        archived_at: null,
        read_only_at: null,
        archive_reason: null,
        conversation_version: conv.conversation_version + 1,
      });
    });

    this.logger.log(
      `Post-stay started for booking ${bookingId}; archive scheduled at ${postStayEndsAt.toISOString()}`,
    );
  }

  async archiveConversation(
    conversationId: string,
    reason: ArchiveReason | string = 'AUTO',
  ): Promise<void> {
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv || conv.messaging_state === 'ARCHIVED') return;

    const booking = conv.booking_id
      ? await this.bookingRepo.findOne({ where: { id: conv.booking_id } })
      : null;
    const listing = booking?.listing_id
      ? await this.listingRepo.findOne({ where: { id: booking.listing_id } })
      : null;

    const now = new Date();

    await this.dataSource.transaction(async (manager) => {
      const messageRepo = manager.getRepository(StaysMessage);
      const convRepo = manager.getRepository(StaysConversation);

      const hasArchiveNotice = await messageRepo.exists({
        where: { conversation_id: conv.id, type: 'SYSTEM_NOTICE' },
      });

      if (!hasArchiveNotice) {
        await this.timelineSeeder.seedConversationArchived(
          manager,
          conv,
          booking?.id ?? conv.booking_id,
        );
      }

      await convRepo.update(conv.id, {
        messaging_state: 'ARCHIVED',
        guest_visibility: 'ARCHIVED',
        host_visibility: 'ARCHIVED',
        archived_at: conv.archived_at ?? now,
        read_only_at: conv.read_only_at ?? now,
        archive_reason: reason,
        conversation_version: conv.conversation_version + 1,
      });
    });

    if (conv.booking_id && conv.guest_user_id && conv.host_user_id) {
      void this.domainEvents.publish(EVENTS.CONVERSATION_ARCHIVED, 'stays', {
        bookingId: conv.booking_id,
        listingId: conv.listing_id ?? booking?.listing_id ?? '',
        conversationId: conv.id,
        guestUserId: conv.guest_user_id,
        hostUserId: conv.host_user_id,
        listingTitle: listing?.title,
      });
    }

    this.logger.log(`Archived conversation ${conversationId} (${reason})`);
  }

  async reopenConversation(
    conversationId: string,
    options: { reason?: string; disableAutoArchive?: boolean } = {},
  ): Promise<StaysConversation> {
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv) throw new NotFoundException('Conversation not found');

    const booking = conv.booking_id
      ? await this.bookingRepo.findOne({ where: { id: conv.booking_id } })
      : null;
    const listing = booking?.listing_id
      ? await this.listingRepo.findOne({ where: { id: booking.listing_id } })
      : null;

    const postStayEndsAt =
      booking?.status === 'COMPLETED' && !options.disableAutoArchive
        ? this.computePostStayEndsAt(booking, listing)
        : conv.post_stay_ends_at;

    await this.convRepo.update(conv.id, {
      messaging_state: 'ACTIVE',
      guest_visibility: 'ACTIVE',
      host_visibility: 'ACTIVE',
      archived_at: null,
      read_only_at: null,
      archive_reason: null,
      post_stay_ends_at: postStayEndsAt,
      auto_archive_disabled: options.disableAutoArchive ?? false,
      auto_archive_disabled_reason: options.disableAutoArchive
        ? (options.reason ?? 'manual')
        : null,
      conversation_version: conv.conversation_version + 1,
    });

    const updated = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!updated) throw new NotFoundException('Conversation not found');
    return updated;
  }

  async archiveDueConversations(): Promise<number> {
    const due = await this.convRepo
      .createQueryBuilder('c')
      .where('c.type = :t', { t: 'BOOKING' })
      .andWhere("c.messaging_state = 'ACTIVE'")
      .andWhere('c.post_stay_ends_at IS NOT NULL')
      .andWhere('c.post_stay_ends_at <= NOW()')
      .andWhere('c.auto_archive_disabled = FALSE')
      .getMany();

    for (const conv of due) {
      try {
        await this.archiveConversation(conv.id, 'AUTO');
      } catch (err) {
        this.logger.warn(
          `Failed to auto-archive ${conv.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return due.length;
  }
}
