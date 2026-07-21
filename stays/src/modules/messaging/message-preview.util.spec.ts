import { formatInboxPreview } from './message-preview.util';

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

  it('falls back to Photo for image messages', () => {
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
});
