import type { MessageType } from './entities/stays-message.entity';

type PreviewInput = {
  type: MessageType | string;
  body?: string | null;
  metadata?: Record<string, unknown> | null;
  senderLabel?: string | null;
};

type SenderContext = {
  senderId?: string | null;
  viewerUserId: string;
  guestUserId: string;
  hostUserId: string | null;
  hostDisplayName?: string | null;
  guestDisplayName?: string | null;
  counterpartDisplayName?: string | null;
};

function pickText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sentMediaPreview(
  mediaLabel: string,
  senderLabel?: string | null,
  fallback?: string,
): string {
  if (senderLabel) return `${senderLabel} sent a ${mediaLabel}`;
  return fallback ?? mediaLabel.charAt(0).toUpperCase() + mediaLabel.slice(1);
}

/** Resolve "You" vs counterpart/sender name for inbox preview copy. */
export function resolveInboxSenderLabel(ctx: SenderContext): string | null {
  const { senderId, viewerUserId, guestUserId, hostUserId } = ctx;
  if (!senderId) return null;
  if (senderId === viewerUserId) return 'You';

  if (senderId === hostUserId) {
    return ctx.hostDisplayName ?? ctx.counterpartDisplayName ?? 'Host';
  }
  if (senderId === guestUserId) {
    return ctx.guestDisplayName ?? ctx.counterpartDisplayName ?? 'Guest';
  }
  return ctx.counterpartDisplayName ?? null;
}

/** Human-readable inbox preview for the chronologically latest message. */
export function formatInboxPreview(input: PreviewInput): string {
  const meta = input.metadata ?? {};
  const body = pickText(input.body);
  const caption = pickText(meta.caption);
  const title = pickText(meta.title);
  const cardBody = pickText(meta.body);
  const senderLabel = input.senderLabel ?? null;

  switch (input.type) {
    case 'TEXT':
      return body ?? '';
    case 'IMAGE':
      if (caption) return caption;
      return sentMediaPreview('photo', senderLabel, 'Photo');
    case 'FILE':
      if (caption && caption !== 'Voice message') return caption;
      if (caption === 'Voice message') {
        return sentMediaPreview('voice message', senderLabel, 'Voice message');
      }
      return sentMediaPreview('file', senderLabel, 'File');
    case 'VIDEO':
      if (caption) return caption;
      return sentMediaPreview('video', senderLabel, 'Video');
    case 'VOICE':
      return sentMediaPreview('voice message', senderLabel, 'Voice message');
    case 'LOCATION':
      if (caption) return caption;
      return sentMediaPreview('location', senderLabel, 'Location');
    case 'SYSTEM_EVENT':
      return body ?? title ?? 'Booking update';
    case 'SYSTEM_NOTICE':
      return body ?? title ?? 'Notice';
    case 'BOOKING_CARD':
      return title ?? cardBody ?? 'Booking confirmed';
    case 'PROPERTY_CARD':
      return title ?? cardBody ?? 'Property details';
    case 'CHECKIN_CARD':
      return title ?? cardBody ?? 'Check-in details';
    case 'WIFI_CARD':
      return title ?? (cardBody ? `Wi-Fi · ${cardBody}` : 'Wi-Fi details');
    case 'LOCATION_CARD':
      return title ?? cardBody ?? 'Location';
    case 'REVIEW_CARD':
      return title ?? 'Review your stay';
    case 'PAYMENT_CARD':
      return title ?? cardBody ?? 'Payment update';
    default:
      return title ?? cardBody ?? body ?? 'Message';
  }
}
