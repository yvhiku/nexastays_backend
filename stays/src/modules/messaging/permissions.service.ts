import { Injectable } from '@nestjs/common';
import { StaysConversation } from './entities/stays-conversation.entity';
import type { ConversationPermissions } from './messaging.types';

@Injectable()
export class MessagingPermissionsService {
  resolve(conversation: StaysConversation, userId: string): ConversationPermissions {
    const isGuest = conversation.guest_user_id === userId;
    const isHost = conversation.host_user_id === userId;
    if (!isGuest && !isHost) {
      return this.denied();
    }

    const blocked =
      (isGuest && conversation.blocked_by_host) ||
      (isHost && conversation.blocked_by_guest);
    const readOnlyState =
      conversation.messaging_state === 'READ_ONLY' ||
      conversation.messaging_state === 'ARCHIVED' ||
      conversation.messaging_state === 'LOCKED';
    const isReadOnly = readOnlyState || blocked;

    const notificationLevel = isGuest
      ? conversation.notification_level_guest
      : conversation.notification_level_host;

    return {
      canSend: !isReadOnly && !blocked,
      canUpload: !isReadOnly && !blocked,
      canCall: isGuest && !blocked && conversation.messaging_state === 'ACTIVE',
      canReport: !blocked,
      canBlock: !blocked,
      canReview: isGuest && conversation.messaging_state !== 'LOCKED',
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
      isReadOnly: true,
      canArchive: false,
      canDelete: false,
      notificationLevel: 'ALL',
    };
  }

  isParticipant(conversation: StaysConversation, userId: string): boolean {
    return (
      conversation.guest_user_id === userId || conversation.host_user_id === userId
    );
  }

  visibilityFor(conversation: StaysConversation, userId: string): string {
    if (conversation.guest_user_id === userId) return conversation.guest_visibility;
    if (conversation.host_user_id === userId) return conversation.host_visibility;
    return 'DELETED';
  }
}
