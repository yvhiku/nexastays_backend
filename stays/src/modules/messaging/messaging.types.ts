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
    verified?: boolean;
    rating?: number | null;
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
  attachmentVersion: number;
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
  postStayEndsAt?: string | null;
  autoArchiveDisabled?: boolean;
  archiveReason?: string | null;
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

export type DeliveryState = 'PENDING' | 'PERSISTED' | 'SENT' | 'DELIVERED' | 'READ';

export type ProcessingStatus = 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED';
export type VirusScanStatus = 'PENDING' | 'SAFE' | 'FAILED';

export interface AttachmentDto {
  id: string;
  sessionId: string | null;
  mediaAssetId: string | null;
  /** Processing pipeline status */
  processingStatus: ProcessingStatus;
  /** @deprecated use processingStatus */
  status: ProcessingStatus;
  virusScanStatus: VirusScanStatus;
  mime: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  orientation: number | null;
  durationMs: number | null;
  checksum: string | null;
  blurhash: string | null;
  originalFilename: string | null;
  thumbnail: SignedMedia | null;
  full: SignedMedia | null;
  /** Alias for full — structured signed URL contract */
  original: SignedMedia | null;
}

export interface AttachmentSessionDto {
  id: string;
  conversationId: string;
  status: 'CREATED' | 'UPLOADING' | 'READY' | 'COMPLETED' | 'ABANDONED';
  expiresAt: string;
  attachments: AttachmentDto[];
}

export interface TextPayload {
  text: string;
}

export interface MediaPayload {
  attachmentIds: string[];
  caption?: string;
  attachments?: AttachmentDto[];
}

export interface TimelineCardPayload {
  kind: string;
  title: string;
  body?: string;
  icon?: string;
  actions?: Array<{
    id: string;
    label: string;
    type: string;
    value?: string;
    url?: string;
  }>;
  coverMediaId?: string | null;
  listingId?: string | null;
  bookingId?: string | null;
  snapshot?: Record<string, unknown>;
}

export type MessagePayload = TextPayload | MediaPayload | TimelineCardPayload;

export interface MessageDto {
  id: string;
  conversationId: string;
  conversationSequence: number;
  senderId: string | null;
  type: string;
  body: string | null;
  metadata: Record<string, unknown>;
  payload: MessagePayload;
  status: string;
  deliveryState: DeliveryState;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  isSystem: boolean;
  clientMessageId: string | null;
  createdAt: string;
  isOwn: boolean;
  presentationVersion: number;
  attachments: AttachmentDto[];
}

/** @deprecated use ConversationDetailResponse */
export interface ConversationDetail extends ConversationListItem {
  bookingId: string | null;
  bookingStatus?: string | null;
  messages: MessageDto[];
  hasMore: boolean;
}
