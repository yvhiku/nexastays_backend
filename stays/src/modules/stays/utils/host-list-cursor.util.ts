import { BadRequestException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Context-bound, HMAC-signed opaque cursors for host list pagination.
 * Payload binds host + query dimensions so reuse under another filter/sort fails.
 */

export type HostListCursorKind = 'bookings' | 'listings';

export type HostListCursorPayload = {
  v: 1;
  kind: HostListCursorKind;
  hostId: string;
  sort: string;
  filter: string;
  search: string;
  listingId: string;
  status: string;
  /** Sort-key tuple for keyset (string|number|null). */
  keys: Record<string, string | number | null>;
  id: string;
};

export type HostListCursorContext = {
  kind: HostListCursorKind;
  hostId: string;
  sort: string;
  filter?: string;
  search?: string;
  listingId?: string;
  status?: string;
};

function signingSecret(): string {
  const fromEnv =
    process.env.HOST_LIST_CURSOR_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'HOST_LIST_CURSOR_SECRET or JWT_SECRET is required in production for list cursors.',
    );
  }
  return 'nexa-host-list-cursor-dev';
}

function b64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
  return b
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

function normalizeContext(ctx: HostListCursorContext) {
  return {
    kind: ctx.kind,
    hostId: ctx.hostId,
    sort: ctx.sort,
    filter: ctx.filter ?? '',
    search: (ctx.search ?? '').trim().toLowerCase(),
    listingId: ctx.listingId ?? '',
    status: ctx.status ?? '',
  };
}

function signBody(bodyB64: string): string {
  const digest = createHmac('sha256', signingSecret())
    .update(bodyB64)
    .digest();
  return b64urlEncode(digest);
}

export function encodeHostListCursor(
  ctx: HostListCursorContext,
  keys: Record<string, string | number | null>,
  id: string,
): string {
  const norm = normalizeContext(ctx);
  const payload: HostListCursorPayload = {
    v: 1,
    ...norm,
    keys,
    id,
  };
  const bodyB64 = b64urlEncode(JSON.stringify(payload));
  return `${bodyB64}.${signBody(bodyB64)}`;
}

export function decodeHostListCursor(
  cursor: string | undefined | null,
  ctx: HostListCursorContext,
): HostListCursorPayload | null {
  if (cursor == null || cursor === '') return null;
  const parts = cursor.split('.');
  if (parts.length !== 2) {
    throw new BadRequestException('Invalid cursor');
  }
  const [bodyB64, sig] = parts;
  const expected = signBody(bodyB64);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new BadRequestException('Invalid cursor');
    }
  } catch (e) {
    if (e instanceof BadRequestException) throw e;
    throw new BadRequestException('Invalid cursor');
  }

  let payload: HostListCursorPayload;
  try {
    payload = JSON.parse(b64urlDecode(bodyB64).toString('utf8')) as HostListCursorPayload;
  } catch {
    throw new BadRequestException('Invalid cursor');
  }

  if (payload?.v !== 1 || !payload.id || !payload.kind) {
    throw new BadRequestException('Invalid cursor');
  }

  const norm = normalizeContext(ctx);
  if (
    payload.kind !== norm.kind ||
    payload.hostId !== norm.hostId ||
    payload.sort !== norm.sort ||
    payload.filter !== norm.filter ||
    payload.search !== norm.search ||
    payload.listingId !== norm.listingId ||
    payload.status !== norm.status
  ) {
    throw new BadRequestException(
      'Cursor does not match the current list query context',
    );
  }

  return payload;
}
