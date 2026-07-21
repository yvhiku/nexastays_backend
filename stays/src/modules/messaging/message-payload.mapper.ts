import type { StaysMessage } from './entities/stays-message.entity';
import type { AttachmentDto, MessagePayload, TimelineCardPayload } from './messaging.types';

export type DeliveryState = 'PERSISTED' | 'SENT' | 'DELIVERED' | 'READ' | 'PENDING';

export function resolveDeliveryState(message: StaysMessage): DeliveryState {
  if (message.status === 'READ' || message.read_at) return 'READ';
  if (message.status === 'DELIVERED' || message.delivered_at) return 'DELIVERED';
  if (message.status === 'PERSISTED' && message.sent_at) return 'SENT';
  if (message.status === 'PERSISTED') return 'PERSISTED';
  return 'PENDING';
}

export function buildMessagePayload(
  type: string,
  body: string | null,
  metadata: Record<string, unknown>,
  attachments: AttachmentDto[] = [],
): MessagePayload {
  const meta = metadata ?? {};
  const cardTypes = new Set([
    'BOOKING_CARD',
    'PROPERTY_CARD',
    'CHECKIN_CARD',
    'WIFI_CARD',
    'LOCATION_CARD',
    'REVIEW_CARD',
    'PAYMENT_CARD',
    'SYSTEM_EVENT',
    'SYSTEM_NOTICE',
  ]);

  if (type === 'TEXT') {
    return { text: body ?? '' };
  }

  if (type === 'IMAGE' || type === 'FILE') {
    const ids =
      (meta.attachment_ids as string[] | undefined) ??
      attachments.map((a) => a.id);
    return {
      attachmentIds: ids,
      caption: (meta.caption as string | undefined) ?? body ?? undefined,
      attachments,
    };
  }

  if (cardTypes.has(type) || meta.kind) {
    return {
      kind: String(meta.kind ?? type.replace(/_CARD$/, '').toLowerCase()),
      title: String(meta.title ?? body ?? ''),
      body: meta.body as string | undefined,
      icon: meta.icon as string | undefined,
      actions: (meta.actions as TimelineCardPayload['actions']) ?? [],
      coverMediaId: meta.coverMediaId as string | null | undefined,
      listingId: meta.listingId as string | null | undefined,
      bookingId: meta.bookingId as string | null | undefined,
      snapshot: meta.snapshot as Record<string, unknown> | undefined,
    };
  }

  return { text: body ?? '' };
}

export function payloadToStorage(
  type: string,
  payload: MessagePayload,
): { body: string | null; metadata: Record<string, unknown> } {
  if ('text' in payload && type === 'TEXT') {
    return {
      body: payload.text,
      metadata: { source: 'USER', schemaVersion: 1, cardVersion: 1, presentationVersion: 1 },
    };
  }

  if ('attachmentIds' in payload) {
    return {
      body: payload.caption ?? null,
      metadata: {
        source: 'USER',
        schemaVersion: 1,
        cardVersion: 1,
        presentationVersion: 1,
        attachment_ids: payload.attachmentIds,
        caption: payload.caption,
      },
    };
  }

  if ('kind' in payload) {
    return {
      body: null,
      metadata: {
        source: 'SYSTEM',
        schemaVersion: 1,
        cardVersion: 1,
        presentationVersion: 1,
        kind: payload.kind,
        title: payload.title,
        body: payload.body,
        icon: payload.icon,
        actions: payload.actions ?? [],
        coverMediaId: payload.coverMediaId,
        listingId: payload.listingId,
        bookingId: payload.bookingId,
        snapshot: payload.snapshot,
      },
    };
  }

  return { body: null, metadata: {} };
}
