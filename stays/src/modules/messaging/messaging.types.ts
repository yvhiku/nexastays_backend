export type NotificationLevel = 'ALL' | 'IMPORTANT' | 'MUTED';

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
  notificationLevel: NotificationLevel;
}

export interface SignedMedia {
  url: string;
  version: number;
  expiresAt: string;
}

export interface ReservationSnapshot {
  listingTitle: string;
  listingId?: string | null;
  coverMediaId?: string | null;
  /** @deprecated derive via MessagingMediaService */
  primaryPhotoUrl?: string | null;
  addressDisplay?: string | null;
  city?: string | null;
  country?: string | null;
  checkinDate: string;
  checkoutDate: string;
  guestCount: number;
  hostDisplayName?: string | null;
  guestDisplayName?: string | null;
  bookingReference?: string | null;
  listingReference?: string | null;
}

export interface ReservationPresentation {
  listingTitle: string;
  listingId: string | null;
  coverMedia: SignedMedia | null;
  addressDisplay: string | null;
  city: string | null;
  country: string | null;
  checkinDate: string;
  checkoutDate: string;
  guestCount: number;
  bookingReference: string | null;
  bookingId: string | null;
}

export interface ConversationPresentation {
  title: string;
  subtitle: string;
  avatar: SignedMedia | null;
  bookingChip: string | null;
  statusChip: string | null;
  counterpart: {
    id: string;
    displayName: string;
  };
  listing: {
    title: string;
    city?: string | null;
  };
  reservation: ReservationPresentation;
}

export interface ConversationSyncMeta {
  conversationVersion: number;
  snapshotVersion: number;
  lastMessageId: string | null;
  unreadCount: number;
  lastReadPointer: {
    messageId: string | null;
    readAt: string | null;
  };
}

export interface ConversationDomain {
  id: string;
  type: string;
  bookingId: string | null;
  listingId: string | null;
  messagingState: string;
  visibility: string;
}

export interface ConversationListResponse {
  conversation: ConversationDomain;
  presentation: ConversationPresentation;
  sync: ConversationSyncMeta;
  lastMessage: {
    preview: string | null;
    at: string | null;
  };
  permissions: ConversationPermissions;
}

export interface ConversationDetailResponse {
  conversation: ConversationDomain;
  presentation: ConversationPresentation;
  timeline: MessageDto[];
  permissions: ConversationPermissions;
  sync: ConversationSyncMeta;
  hasMore: boolean;
  bookingStatus: string | null;
}

/** @deprecated use ConversationListResponse */
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

export interface TimelineCardMetadata {
  schemaVersion: number;
  cardVersion: number;
  presentationVersion?: number;
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
  coverMediaId?: string | null;
  listingId?: string | null;
  bookingId?: string | null;
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
  presentationVersion: number;
}

/** @deprecated use ConversationDetailResponse */
export interface ConversationDetail extends ConversationListItem {
  bookingId: string | null;
  bookingStatus?: string | null;
  messages: MessageDto[];
  hasMore: boolean;
}
