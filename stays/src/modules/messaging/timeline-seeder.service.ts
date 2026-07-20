import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { StaysBooking } from '../stays/entities/stays-booking.entity';
import { StaysListing } from '../stays/entities/stays-listing.entity';
import { StaysConversation } from './entities/stays-conversation.entity';
import { StaysMessage, MessageType } from './entities/stays-message.entity';
import type { ReservationSnapshot, TimelineCardMetadata } from './messaging.types';

@Injectable()
export class TimelineSeederService {
  buildSnapshot(
    booking: StaysBooking,
    listing: StaysListing,
    hostDisplayName?: string | null,
    guestDisplayName?: string | null,
  ): ReservationSnapshot {
    const cover =
      listing.media?.find((m) => m.is_cover && m.kind === 'PHOTO') ??
      listing.media?.find((m) => m.kind === 'PHOTO');
    const photo = cover
      ? `/api/v1/stays/listings/${listing.id}/media/${cover.asset_id}`
      : null;
    const addressParts = [
      listing.building_name,
      listing.neighborhood,
      listing.city,
    ].filter(Boolean);
    return {
      listingTitle: listing.title,
      primaryPhotoUrl: photo,
      addressDisplay: addressParts.join(', ') || listing.city,
      checkinDate: String(booking.checkin_date).slice(0, 10),
      checkoutDate: String(booking.checkout_date).slice(0, 10),
      guestCount: booking.guest_count,
      hostDisplayName: hostDisplayName ?? null,
      guestDisplayName: guestDisplayName ?? null,
      bookingReference: booking.booking_reference ?? null,
    };
  }

  async seedBookingConfirmed(
    manager: EntityManager,
    conversation: StaysConversation,
    snapshot: ReservationSnapshot,
    listing: StaysListing,
  ): Promise<StaysMessage[]> {
    const messageRepo = manager.getRepository(StaysMessage);
    const seeds: Array<{ type: MessageType; body: string | null; metadata: Record<string, unknown> }> = [
      {
        type: 'SYSTEM_EVENT',
        body: 'Booking confirmed',
        metadata: { source: 'SYSTEM', schemaVersion: 1, cardVersion: 1 },
      },
      {
        type: 'BOOKING_CARD',
        body: null,
        metadata: this.bookingCard(snapshot) as unknown as Record<string, unknown>,
      },
      {
        type: 'PROPERTY_CARD',
        body: null,
        metadata: this.propertyCard(snapshot, listing) as unknown as Record<string, unknown>,
      },
    ];

    const saved: StaysMessage[] = [];
    for (const seed of seeds) {
      saved.push(await this.insertMessage(manager, conversation, seed));
    }
    return saved;
  }

  private bookingCard(snapshot: ReservationSnapshot): TimelineCardMetadata {
    return {
      schemaVersion: 1,
      cardVersion: 1,
      kind: 'booking',
      title: snapshot.listingTitle,
      body: `${snapshot.checkinDate} – ${snapshot.checkoutDate} · ${snapshot.guestCount} guests`,
      source: 'SYSTEM',
      actions: snapshot.bookingReference
        ? [{ id: 'view_booking', label: 'View booking', type: 'deep_link', url: `/bookings` }]
        : [],
    };
  }

  private propertyCard(
    snapshot: ReservationSnapshot,
    listing: StaysListing,
  ): TimelineCardMetadata {
    const mapsUrl =
      listing.geo_lat != null && listing.geo_lng != null
        ? `https://maps.google.com/?q=${listing.geo_lat},${listing.geo_lng}`
        : undefined;
    return {
      schemaVersion: 1,
      cardVersion: 1,
      kind: 'property',
      title: snapshot.listingTitle,
      body: snapshot.addressDisplay ?? undefined,
      source: 'SYSTEM',
      snapshot: { primaryPhotoUrl: snapshot.primaryPhotoUrl },
      actions: mapsUrl
        ? [{ id: 'open_maps', label: 'Open in Maps', type: 'external_maps', url: mapsUrl }]
        : [],
    };
  }

  async insertMessage(
    manager: EntityManager,
    conversation: StaysConversation,
    input: {
      type: MessageType;
      body: string | null;
      metadata: Record<string, unknown>;
      senderId?: string | null;
      clientMessageId?: string | null;
    },
  ): Promise<StaysMessage> {
    const convRepo = manager.getRepository(StaysConversation);
    const messageRepo = manager.getRepository(StaysMessage);

    const locked = await convRepo
      .createQueryBuilder('c')
      .setLock('pessimistic_write')
      .where('c.id = :id', { id: conversation.id })
      .getOne();
    if (!locked) throw new Error('Conversation not found');

    const nextSeq = BigInt(locked.last_message_sequence || 0) + 1n;
    const now = new Date();
    const isSystem = !input.senderId;

    const message = messageRepo.create({
      conversation_id: locked.id,
      conversation_sequence: String(nextSeq),
      sender_id: input.senderId ?? null,
      type: input.type,
      body: input.body,
      metadata: input.metadata,
      status: 'PERSISTED',
      sent_at: now,
      is_system: isSystem,
      client_message_id: input.clientMessageId ?? null,
    });
    const saved = await messageRepo.save(message);

    const preview =
      input.body ??
      (typeof input.metadata.title === 'string' ? input.metadata.title : 'Update');
    await convRepo.update(locked.id, {
      last_message_id: saved.id,
      last_message_sequence: String(nextSeq),
      last_message_preview: preview.slice(0, 200),
      last_message_at: now,
      conversation_version: locked.conversation_version + 1,
      updated_at: now,
      ...(input.senderId === locked.guest_user_id
        ? { unread_host: locked.unread_host + 1 }
        : input.senderId === locked.host_user_id
          ? { unread_guest: locked.unread_guest + 1 }
          : {}),
    });

    return saved;
  }
}
