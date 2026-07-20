export interface ConversationPermissions {
  canSend: boolean;
  canUpload: boolean;
  canCall: boolean;
  canReport: boolean;
  canBlock: boolean;
  canReview: boolean;
  isReadOnly: boolean;
  canArchive: boolean;
  canDelete: boolean;
}

export interface ReservationSnapshot {
  listingTitle: string;
  primaryPhotoUrl?: string | null;
  addressDisplay?: string | null;
  checkinDate: string;
  checkoutDate: string;
  guestCount: number;
  hostDisplayName?: string | null;
  guestDisplayName?: string | null;
  bookingReference?: string | null;
}

export interface TimelineCardMetadata {
  schemaVersion: number;
  cardVersion: number;
  kind: string;
  title: string;
  body?: string;
  icon?: string;
  source?: 'USER' | 'SYSTEM' | 'AI' | 'HOST_AUTOMATION';
  actions?: Array<{
    id: string;
    label: string;
    type: string;
    value?: string;
    url?: string;
  }>;
  snapshot?: Record<string, unknown>;
}

export interface ConversationListItem {
  id: string;
  type: string;
  messagingState: string;
  visibility: string;
  conversationVersion: number;
  lastMessageSequence: number;
  unreadCount: number;
  counterpart: {
    name: string;
    avatarUrl?: string | null;
    isSuperhost: boolean;
  };
  listing: {
    title: string;
    city?: string | null;
  };
  lastMessage: {
    preview: string | null;
    at: string | null;
    deliveryStatus?: string;
  };
  reservationSnapshot: ReservationSnapshot;
  permissions: ConversationPermissions;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  conversationSequence: number;
  senderId: string | null;
  type: string;
  body: string | null;
  metadata: Record<string, unknown>;
  status: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  isSystem: boolean;
  clientMessageId: string | null;
  createdAt: string;
  isOwn: boolean;
}

export interface ConversationDetail extends ConversationListItem {
  bookingId: string | null;
  bookingStatus?: string | null;
  messages: MessageDto[];
  hasMore: boolean;
}
