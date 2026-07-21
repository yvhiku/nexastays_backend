import { Injectable } from '@nestjs/common';
import { StaysConversation } from './entities/stays-conversation.entity';
import { MessagingMediaService } from './messaging-media.service';
import { IdentityProfilePhotoClient } from '../../common/identity/identity-profile-photo.client';
import { ParticipantPresentationService } from './participant-presentation.service';
import { IdentityUserClient } from '../../common/identity/identity-user.client';
import type {
  ConversationPresentation,
  ConversationSyncMeta,
  ReservationPresentation,
  ReservationSnapshot,
  SignedMedia,
} from './messaging.types';

function formatShortDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function bookingLifecycleSubtitle(
  status: string | null | undefined,
  messagingState?: string,
): string {
  const s = (status ?? '').toUpperCase();
  if (messagingState === 'ARCHIVED') return 'Archived';
  if (s === 'COMPLETED') return 'Stay completed';
  if (s === 'CHECKED_IN') return 'Current Stay';
  if (s === 'CONFIRMED') return 'Upcoming Stay';
  if (s === 'CANCELLED' || s === 'CANCELLED_BY_GUEST' || s === 'CANCELLED_BY_HOST') {
    return 'Cancelled';
  }
  if (s === 'EXPIRED') return 'Expired';
  return 'Stay';
}

@Injectable()
export class ConversationPresentationService {
  constructor(
    private readonly media: MessagingMediaService,
    private readonly profilePhotos: IdentityProfilePhotoClient,
    private readonly participants: ParticipantPresentationService,
    private readonly identityUsers: IdentityUserClient,
  ) {}

  async buildPresentation(
    conv: StaysConversation,
    viewerUserId: string,
    snapshot: ReservationSnapshot,
    bookingStatus?: string | null,
  ): Promise<ConversationPresentation> {
    const isGuest = conv.guest_user_id === viewerUserId;
    const counterpartId = isGuest ? conv.host_user_id : conv.guest_user_id;
    const counterpart = await this.participants.resolveCounterpartIdentity(
      conv.host_user_id ?? '',
      conv.guest_user_id,
      conv.booking_id,
      isGuest,
    );

    const profileSummary = counterpartId
      ? await this.identityUsers.getProfileSummary(counterpartId)
      : null;

    const avatar = counterpartId
      ? await this.resolveCounterpartAvatar(counterpartId, conv.snapshot_version ?? 1)
      : null;
    const reservation = this.buildReservationPresentation(conv, snapshot);
    const subtitle = bookingLifecycleSubtitle(bookingStatus, conv.messaging_state);
    const bookingChip = `${snapshot.listingTitle} • ${formatShortDate(snapshot.checkinDate)}–${formatShortDate(snapshot.checkoutDate)} • ${snapshot.guestCount} guests`;

    return {
      title: profileSummary?.fullName ?? counterpart.displayName,
      subtitle,
      avatar,
      bookingChip,
      statusChip: subtitle,
      counterpart: {
        id: counterpartId ?? '',
        displayName: profileSummary?.fullName ?? counterpart.displayName,
        verified: profileSummary?.verified ?? false,
        rating: null,
      },
      listing: {
        title: snapshot.listingTitle ?? 'Stay',
        city: snapshot.city ?? null,
      },
      reservation,
    };
  }

  buildSyncMeta(conv: StaysConversation, viewerUserId: string): ConversationSyncMeta {
    const isGuest = conv.guest_user_id === viewerUserId;
    const unreadCount = isGuest ? conv.unread_guest ?? 0 : conv.unread_host ?? 0;
    const messageId = isGuest
      ? conv.guest_last_read_message_id
      : conv.host_last_read_message_id;
    const readAt = isGuest ? conv.guest_last_read_at : conv.host_last_read_at;

    return {
      conversationVersion: conv.conversation_version,
      snapshotVersion: conv.snapshot_version ?? 1,
      attachmentVersion: conv.attachment_version ?? 1,
      lastMessageId: conv.last_message_id ?? null,
      unreadCount,
      lastReadPointer: {
        messageId: messageId ?? null,
        readAt: readAt?.toISOString() ?? null,
      },
    };
  }

  private async resolveCounterpartAvatar(
    userId: string,
    version: number,
  ): Promise<SignedMedia | null> {
    if (!userId) return null;
    const hasPhoto = await this.profilePhotos.hasProfilePhoto(userId);
    if (!hasPhoto) return null;
    return this.media.resolveAvatar(userId, version);
  }

  private buildReservationPresentation(
    conv: StaysConversation,
    snapshot: ReservationSnapshot,
  ): ReservationPresentation {
    const listingId = snapshot.listingId ?? conv.listing_id ?? null;
    const coverMediaId = snapshot.coverMediaId ?? null;
    const coverMedia =
      listingId && coverMediaId
        ? this.media.resolveListingCover(listingId, coverMediaId, {
            w: 640,
            h: 360,
            fit: 'crop',
          }, conv.snapshot_version ?? 1)
        : null;

    return {
      listingTitle: snapshot.listingTitle ?? 'Stay',
      listingId,
      coverMedia,
      addressDisplay: snapshot.addressDisplay ?? null,
      city: snapshot.city ?? null,
      country: snapshot.country ?? null,
      checkinDate: snapshot.checkinDate,
      checkoutDate: snapshot.checkoutDate,
      guestCount: snapshot.guestCount,
      bookingReference: snapshot.bookingReference ?? null,
      bookingId: conv.booking_id ?? null,
    };
  }
}
