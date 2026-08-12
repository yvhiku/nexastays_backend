import {
  decodeHostListCursor,
  encodeHostListCursor,
} from './host-list-cursor.util';

describe('host-list-cursor', () => {
  const ctx = {
    kind: 'bookings' as const,
    hostId: 'host-a',
    sort: 'ops',
    filter: 'all',
    search: '',
    listingId: '',
    status: '',
  };

  it('round-trips keys and id', () => {
    const token = encodeHostListCursor(
      ctx,
      { ops_rank: 1, checkin_date: '2026-08-12' },
      'booking-1',
    );
    const decoded = decodeHostListCursor(token, ctx);
    expect(decoded?.id).toBe('booking-1');
    expect(decoded?.keys.ops_rank).toBe(1);
  });

  it('rejects cursor when filter context changes', () => {
    const token = encodeHostListCursor(
      ctx,
      { ops_rank: 0, checkin_date: '2026-08-12' },
      'booking-1',
    );
    expect(() =>
      decodeHostListCursor(token, { ...ctx, filter: 'today' }),
    ).toThrow(/context/i);
  });

  it('rejects cursor for another host', () => {
    const token = encodeHostListCursor(
      ctx,
      { ops_rank: 0, checkin_date: '2026-08-12' },
      'booking-1',
    );
    expect(() =>
      decodeHostListCursor(token, { ...ctx, hostId: 'host-b' }),
    ).toThrow(/context/i);
  });

  it('rejects tampered payload', () => {
    const token = encodeHostListCursor(ctx, { ops_rank: 0 }, 'booking-1');
    const [body] = token.split('.');
    expect(() => decodeHostListCursor(`${body}.AAAA`, ctx)).toThrow(
      /Invalid cursor/,
    );
  });
});
