import { formatInboxPreview, resolveInboxSenderLabel } from './message-preview.util';

describe('formatInboxPreview', () => {
  it('prefers message body for text messages', () => {
    expect(
      formatInboxPreview({ type: 'TEXT', body: 'hello there', metadata: {} }),
    ).toBe('hello there');
  });

  it('uses caption for image messages without body', () => {
    expect(
      formatInboxPreview({
        type: 'IMAGE',
        body: null,
        metadata: { caption: 'Sunset view' },
      }),
    ).toBe('Sunset view');
  });

  it('shows sender sent a photo for image messages', () => {
    expect(
      formatInboxPreview({
        type: 'IMAGE',
        body: null,
        metadata: {},
        senderLabel: 'Mohamed Fikri',
      }),
    ).toBe('Mohamed Fikri sent a photo');
  });

  it('falls back to Photo for image messages without sender', () => {
    expect(formatInboxPreview({ type: 'IMAGE', body: null, metadata: {} })).toBe(
      'Photo',
    );
  });

  it('uses card title instead of Update for property cards', () => {
    expect(
      formatInboxPreview({
        type: 'PROPERTY_CARD',
        body: null,
        metadata: { title: 'Talia surf taghazout', body: 'Taghazout' },
      }),
    ).toBe('Talia surf taghazout');
  });

  it('uses system event body', () => {
    expect(
      formatInboxPreview({
        type: 'SYSTEM_EVENT',
        body: 'Booking confirmed',
        metadata: {},
      }),
    ).toBe('Booking confirmed');
  });

  it('uses guest review card title by default', () => {
    expect(
      formatInboxPreview({
        type: 'REVIEW_CARD',
        body: null,
        metadata: { title: 'Review your stay' },
      }),
    ).toBe('Review your stay');
  });

  it('uses host-specific review preview when viewer is host', () => {
    expect(
      formatInboxPreview({
        type: 'REVIEW_CARD',
        body: null,
        metadata: {
          title: 'Review your stay',
          hostView: { title: 'Review request sent' },
        },
        viewerRole: 'host',
      }),
    ).toBe('Review request sent');
  });

  it('uses host reviewed preview after guest submits review', () => {
    expect(
      formatInboxPreview({
        type: 'REVIEW_CARD',
        body: null,
        metadata: {
          reviewed: true,
          title: 'Thanks for reviewing!',
          hostView: { title: 'Guest reviewed successfully' },
        },
        viewerRole: 'host',
      }),
    ).toBe('Guest reviewed successfully');
  });
});

describe('resolveInboxSenderLabel', () => {
  it('returns You when viewer sent the message', () => {
    expect(
      resolveInboxSenderLabel({
        senderId: 'guest-1',
        viewerUserId: 'guest-1',
        guestUserId: 'guest-1',
        hostUserId: 'host-1',
        hostDisplayName: 'Mohamed Fikri',
      }),
    ).toBe('You');
  });

  it('returns host name when host sent the message', () => {
    expect(
      resolveInboxSenderLabel({
        senderId: 'host-1',
        viewerUserId: 'guest-1',
        guestUserId: 'guest-1',
        hostUserId: 'host-1',
        hostDisplayName: 'Mohamed Fikri',
      }),
    ).toBe('Mohamed Fikri');
  });
});
