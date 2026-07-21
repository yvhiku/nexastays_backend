import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { StaysBooking } from '../stays/entities/stays-booking.entity';
import { StaysListing } from '../stays/entities/stays-listing.entity';
import { StaysConversation } from './entities/stays-conversation.entity';
import { MessagingOutboxService } from './outbox.service';
import { TimelineSeederService } from './timeline-seeder.service';
import { ParticipantPresentationService } from './participant-presentation.service';
import { MESSAGING_INTERNAL_EVENTS } from './messaging-internal.events';
import { EVENTS } from '@nexa/event-bus';

const MESSAGEABLE_BOOKING_STATUSES = new Set([
  'CONFIRMED',
  'CHECKED_IN',
  'COMPLETED',
]);

@Injectable()
export class ConversationProvisionService {
  private readonly logger = new Logger(ConversationProvisionService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly timelineSeeder: TimelineSeederService,
    private readonly outbox: MessagingOutboxService,
    private readonly participants: ParticipantPresentationService,
  ) {}

  /**
   * Must run inside the payment success transaction.
   */
  async provisionWithinTransaction(
    manager: EntityManager,
    booking: StaysBooking,
    listingId: string,
    provider?: string,
    providerIntentId?: string,
  ): Promise<StaysConversation | null> {
    const convRepo = manager.getRepository(StaysConversation);
    const listingRepo = manager.getRepository(StaysListing);
    const existing = await convRepo.findOne({ where: { booking_id: booking.id } });
    if (existing) return existing;

    const listing = await listingRepo.findOne({
      where: { id: listingId },
      relations: ['media'],
    });
    if (!listing) return null;

    if (!listing.host_user_id) {
      this.logger.warn(`No host for booking ${booking.id}; skipping conversation`);
      return null;
    }

    const hostName = await this.participants.resolveHostDisplayName(listing.host_user_id);
    const guestName = await this.participants.resolveGuestDisplayName(booking.id);

    const snapshot = this.timelineSeeder.buildSnapshot(booking, listing, {
      hostDisplayName: hostName,
      guestDisplayName: guestName,
    });

    const conversation = await convRepo.save(
      convRepo.create({
        booking_id: booking.id,
        type: 'BOOKING',
        messaging_state: 'ACTIVE',
        listing_id: listing.id,
        host_user_id: listing.host_user_id,
        guest_user_id: booking.guest_user_id,
        snapshot_version: 1,
        reservation_snapshot: snapshot as unknown as Record<string, unknown>,
        conversation_version: 1,
      }),
    );

    await this.timelineSeeder.seedBookingConfirmed(manager, conversation, snapshot, listing);

    const total = Number(booking.total_paid ?? 0);
    const currency = booking.currency ?? 'MAD';

    await this.outbox.enqueue(manager, EVENTS.BOOKING_CONFIRMED, {
      bookingId: booking.id,
      listingId: listing.id,
      hostUserId: listing.host_user_id,
      guestUserId: booking.guest_user_id,
      amount: String(total),
      currency,
      conversationId: conversation.id,
    });

    await this.outbox.enqueue(manager, EVENTS.PAYMENT_SUCCEEDED, {
      bookingId: booking.id,
      guestUserId: booking.guest_user_id,
      provider: provider ?? 'payment',
      providerIntentId: providerIntentId ?? booking.payment_intent_id ?? '',
      amount: String(total),
      currency,
    });

    return conversation;
  }

  /** Backfill or return the booking thread (guest or host). */
  async ensureForBooking(
    bookingId: string,
    userId: string,
  ): Promise<StaysConversation> {
    const conv = await this.dataSource.transaction(async (manager) => {
      const convRepo = manager.getRepository(StaysConversation);
      const existing = await convRepo.findOne({ where: { booking_id: bookingId } });
      if (existing) {
        if (
          existing.guest_user_id !== userId &&
          existing.host_user_id !== userId
        ) {
          throw new ForbiddenException('Not a participant on this booking');
        }
        await this.outbox.enqueue(manager, MESSAGING_INTERNAL_EVENTS.SNAPSHOT_REPAIR_REQUESTED, {
          conversationId: existing.id,
        });
        return existing;
      }

      const bookingRepo = manager.getRepository(StaysBooking);
      const booking = await bookingRepo.findOne({
        where: { id: bookingId },
      });
      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      const listingRepo = manager.getRepository(StaysListing);
      const listing = await listingRepo.findOne({
        where: { id: booking.listing_id },
      });
      const hostUserId = listing?.host_user_id ?? null;
      const isGuest = booking.guest_user_id === userId;
      const isHost = hostUserId === userId;
      if (!isGuest && !isHost) {
        throw new ForbiddenException('Not a participant on this booking');
      }
      if (!MESSAGEABLE_BOOKING_STATUSES.has(booking.status)) {
        throw new BadRequestException(
          'Messaging is available after the booking is confirmed',
        );
      }

      const created = await this.provisionWithinTransaction(
        manager,
        booking,
        booking.listing_id,
        'backfill',
        booking.payment_intent_id ?? undefined,
      );
      if (!created) {
        throw new BadRequestException(
          'Could not open conversation for this booking',
        );
      }
      return created;
    });

    await this.outbox.enqueueDirect(MESSAGING_INTERNAL_EVENTS.SNAPSHOT_REPAIR_REQUESTED, {
      conversationId: conv.id,
    });

    return conv;
  }
}
