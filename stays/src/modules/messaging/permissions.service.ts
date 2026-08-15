import { Injectable } from '@nestjs/common';
import { StaysConversation } from './entities/stays-conversation.entity';
import type { ConversationPermissions } from './messaging.types';

export type MessagingAccessOptions = {
  /** ADMIN JWT may read/send SUPPORT conversations only — never occupies guest/host ids. */
  isAdmin?: boolean;
  /** SUPPORT ticket CLOSED — force read-only even if archive lagged. */
  ticketClosed?: boolean;
};

@Injectable()
export class MessagingPermissionsService {
  resolve(
    conversation: StaysConversation,
    userId: string,
    options: MessagingAccessOptions = {},
  ): ConversationPermissions {
    const isGuest = conversation.guest_user_id === userId;
    const isHost = conversation.host_user_id === userId;
    const isSupportAdmin =
      Boolean(options.isAdmin) && conversation.type === 'SUPPORT';

    if (!isGuest && !isHost && !isSupportAdmin) {
      return this.denied();
    }

    if (isSupportAdmin && !isGuest && !isHost) {
      const readOnlyState =
        conversation.messaging_state === 'READ_ONLY' ||
        conversation.messaging_state === 'ARCHIVED' ||
        conversation.messaging_state === 'LOCKED' ||
        Boolean(options.ticketClosed);
      return {
        canSend: !readOnlyState,
        canUpload: !readOnlyState,
        canCall: false,
        canReport: false,
        canBlock: false,
        canReview: false,
        viewerRole: 'host',
        isReadOnly: readOnlyState,
        canArchive: false,
        canDelete: false,
        notificationLevel: 'ALL',
      };
    }

    const blocked =
      (isGuest && conversation.blocked_by_host) ||
      (isHost && conversation.blocked_by_guest);
    const readOnlyState =
      conversation.messaging_state === 'READ_ONLY' ||
      conversation.messaging_state === 'ARCHIVED' ||
      conversation.messaging_state === 'LOCKED' ||
      Boolean(options.ticketClosed);
    const isReadOnly = readOnlyState || blocked;

    const notificationLevel = isGuest
      ? conversation.notification_level_guest
      : conversation.notification_level_host;

    return {
      canSend: !isReadOnly && !blocked,
      canUpload: !isReadOnly && !blocked,
      canCall: isGuest && !blocked && conversation.messaging_state === 'ACTIVE',
      canReport: !blocked && conversation.type !== 'SUPPORT',
      canBlock: !blocked,
      canReview: isGuest && conversation.messaging_state !== 'LOCKED',
      viewerRole: isGuest ? 'guest' : 'host',
      isReadOnly,
      canArchive: true,
      canDelete: true,
      notificationLevel,
    };
  }

  private denied(): ConversationPermissions {
    return {
      canSend: false,
      canUpload: false,
      canCall: false,
      canReport: false,
      canBlock: false,
      canReview: false,
      viewerRole: 'guest',
      isReadOnly: true,
      canArchive: false,
      canDelete: false,
      notificationLevel: 'ALL',
    };
  }

  isParticipant(
    conversation: StaysConversation,
    userId: string,
    options: MessagingAccessOptions = {},
  ): boolean {
    if (
      conversation.guest_user_id === userId ||
      conversation.host_user_id === userId
    ) {
      return true;
    }
    return Boolean(options.isAdmin) && conversation.type === 'SUPPORT';
  }

  visibilityFor(conversation: StaysConversation, userId: string): string {
    if (conversation.guest_user_id === userId) return conversation.guest_visibility;
    if (conversation.host_user_id === userId) return conversation.host_visibility;
    return 'DELETED';
  }
}
