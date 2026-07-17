import { BadRequestException } from '@nestjs/common';

/**
 * Explore sort keys.
 * `rating` currently uses raw avg_rating + review_count keyset (Phase 1).
 * Phase 2 ranking roadmap: Bayesian average and/or Wilson score lower bound
 * before personalization / hybrid rank.
 */
export type ExploreSort = 'newest' | 'rating';

export type ExploreCursorPayload = {
  v: 1;
  s: ExploreSort;
  /** ISO timestamp — scroll session stable window */
  snapshot?: string;
  /** created_at ISO for keyset */
  c?: string;
  /** listing id for keyset */
  i?: string;
  /** rating sort keys */
  r?: number | null;
  n?: number;
};

const CURSOR_PREFIX = 'v1.';

export function encodeExploreCursor(payload: ExploreCursorPayload): string {
  const json = JSON.stringify(payload);
  return CURSOR_PREFIX + Buffer.from(json, 'utf8').toString('base64url');
}

export function decodeExploreCursor(raw: string | undefined | null): ExploreCursorPayload | null {
  if (raw == null || raw === '') return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith(CURSOR_PREFIX)) {
    throw new BadRequestException({
      code: 'invalid_cursor',
      message: 'Invalid or unsupported cursor.',
    });
  }
  try {
    const json = Buffer.from(trimmed.slice(CURSOR_PREFIX.length), 'base64url').toString(
      'utf8',
    );
    const parsed = JSON.parse(json) as ExploreCursorPayload;
    if (parsed?.v !== 1 || (parsed.s !== 'newest' && parsed.s !== 'rating')) {
      throw new Error('bad shape');
    }
    return parsed;
  } catch {
    throw new BadRequestException({
      code: 'invalid_cursor',
      message: 'Invalid or unsupported cursor.',
    });
  }
}

export function nowSnapshotIso(): string {
  return new Date().toISOString();
}
