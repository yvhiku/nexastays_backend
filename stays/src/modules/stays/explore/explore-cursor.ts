import { BadRequestException } from '@nestjs/common';

/**
 * Explore sort keys.
 * `rating` currently uses raw avg_rating + review_count keyset (Phase 1).
 * Phase 2 ranking roadmap: Bayesian average and/or Wilson score lower bound
 * before personalization / hybrid rank.
 */
export type ExploreSort = 'newest' | 'rating' | 'price_asc' | 'price_desc';

export const EXPLORE_SORTS: readonly ExploreSort[] = [
  'newest',
  'rating',
  'price_asc',
  'price_desc',
] as const;

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
  /** price sort key (base_price) */
  p?: number | null;
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
    if (parsed?.v !== 1 || !EXPLORE_SORTS.includes(parsed.s)) {
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

export function normalizeExploreSort(raw: string | undefined | null): ExploreSort {
  if (raw && EXPLORE_SORTS.includes(raw as ExploreSort)) {
    return raw as ExploreSort;
  }
  return 'newest';
}
