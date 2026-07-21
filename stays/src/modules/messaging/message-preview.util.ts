import type { MessageType } from './entities/stays-message.entity';

type PreviewInput = {
  type: MessageType | string;
  body?: string | null;
  metadata?: Record<string, unknown> | null;
};

function pickText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Human-readable inbox preview for the chronologically latest message. */
export function formatInboxPreview(input: PreviewInput): string {
  const meta = input.metadata ?? {};
  const body = pickText(input.body);
  if (body) return body;

  const caption = pickText(meta.caption);
  if (caption) return caption;

  const title = pickText(meta.title);
  const cardBody = pickText(meta.body);

  switch (input.type) {
    case 'TEXT':
      return body ?? '';
    case 'IMAGE':
      return caption ?? 'Photo';
    case 'FILE':
      return caption ?? 'File';
    case 'VIDEO':
      return caption ?? 'Video';
    case 'VOICE':
      return caption ?? 'Voice message';
    case 'LOCATION':
      return caption ?? 'Location';
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
      return title ?? cardBody ?? 'Message';
  }
}
