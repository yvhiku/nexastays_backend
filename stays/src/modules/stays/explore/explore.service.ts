import { createHash } from 'crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaysListing } from '../entities/stays-listing.entity';
import { StaysListingMedia } from '../entities/stays-listing-media.entity';
import { StaysAvailabilityService } from '../services/stays-availability.service';
import { MetricsService } from '../../../common/metrics/metrics.service';
import {
  decodeExploreCursor,
  encodeExploreCursor,
  nowSnapshotIso,
  type ExploreCursorPayload,
  type ExploreSort,
} from './explore-cursor';

const CARD_LIMIT_DEFAULT = 24;
const CARD_LIMIT_MAX = 48;
const MAP_PIN_MAX = 200;
/** Reject / truncate map boxes larger than this span (degrees). */
const MAX_BOUNDS_SPAN_DEG = 5;
const CACHE_TTL_MS = 45_000;
const CACHE_TTL_DATED_MS = 15_000;
const CACHE_MAX_BYTES = 1_024 * 1_024;

export type ExploreCard = {
  id: string;
  title: string;
  city: string;
  neighborhood: string | null;
  listing_type: string;
  geo_lat: number | null;
  geo_lng: number | null;
  avg_rating: number | null;
  review_count: number;
  instant_booking: boolean;
  has_walkthrough: boolean;
  placement: 'organic';
  price: { base_price: number; currency: string } | null;
  cover: { asset_id: string; kind: 'PHOTO' } | null;
};

export type ExploreMapPin = {
  id: string;
  title: string;
  city: string;
  neighborhood: string | null;
  geo_lat: number;
  geo_lng: number;
  avg_rating: number | null;
  review_count: number;
  bedrooms: number | null;
  max_guests: number | null;
  has_wifi: boolean;
  has_walkthrough: boolean;
  instant_booking: boolean;
  price: { base_price: number; currency: string } | null;
  cover: { asset_id: string; kind: 'PHOTO' } | null;
};

export type ExploreListEnvelope = {
  items: ExploreCard[];
  pagination: { next_cursor: string | null; has_more: boolean };
  meta: {
    query_ms: number;
    sort: ExploreSort;
    cache: 'hit' | 'miss' | 'bypass';
    total_estimate: null;
  };
};

export type ExploreMapEnvelope = {
  items: ExploreMapPin[];
  bounds: { north: number; south: number; east: number; west: number };
  truncated: boolean;
  meta: {
    query_ms: number;
    cache: 'hit' | 'miss' | 'bypass';
  };
};

export type ExploreQueryParams = {
  city?: string;
  checkin_date?: string;
  checkout_date?: string;
  guests?: number;
  verified_walkthrough_only?: boolean;
  instant_booking_only?: boolean;
  listing_type?: string;
  limit?: number;
  cursor?: string;
  sort?: ExploreSort;
  north?: number;
  south?: number;
  east?: number;
  west?: number;
};

type MemoryCacheEntry = { expiresAt: number; value: unknown };

@Injectable()
export class ExploreService {
  private readonly logger = new Logger(ExploreService.name);
  /** Process-local short TTL cache (avoids Nest cache-manager peer conflicts). */
  private readonly memoryCache = new Map<string, MemoryCacheEntry>();

  constructor(
    @InjectRepository(StaysListing)
    private readonly listingRepo: Repository<StaysListing>,
    @InjectRepository(StaysListingMedia)
    private readonly mediaRepo: Repository<StaysListingMedia>,
    private readonly availabilityService: StaysAvailabilityService,
    private readonly metrics: MetricsService,
  ) {}

  async exploreListings(params: ExploreQueryParams): Promise<ExploreListEnvelope> {
    const started = Date.now();
    const sort: ExploreSort = params.sort === 'rating' ? 'rating' : 'newest';
    const limit = Math.min(
      Math.max(params.limit ?? CARD_LIMIT_DEFAULT, 1),
      CARD_LIMIT_MAX,
    );

    let cursor: ExploreCursorPayload | null = null;
    try {
      cursor = decodeExploreCursor(params.cursor);
      if (cursor && cursor.s !== sort) {
        throw new BadRequestException({
          code: 'invalid_cursor',
          message: 'Cursor sort does not match request sort.',
        });
      }
    } catch (err) {
      this.metrics.incrementExploreCursorFailure();
      throw err;
    }

    if (params.north != null || params.south != null || params.east != null || params.west != null) {
      this.validateBounds(params.north!, params.south!, params.east!, params.west!, {
        allowTruncate: false,
      });
    }

    const cacheKey = this.buildCacheKey('list', { ...params, sort, limit });
    const dated = Boolean(params.checkin_date && params.checkout_date);
    const ttl = dated ? CACHE_TTL_DATED_MS : CACHE_TTL_MS;

    const cached = await this.safeCacheGet<ExploreListEnvelope>(cacheKey);
    if (cached) {
      this.metrics.incrementExploreCacheHit();
      return {
        ...cached,
        meta: {
          ...cached.meta,
          query_ms: Date.now() - started,
          cache: 'hit',
        },
      };
    }
    this.metrics.incrementExploreCacheMiss();

    const snapshot = cursor?.snapshot ?? nowSnapshotIso();
    const rows = await this.queryListings({
      ...params,
      sort,
      limit: limit + 1,
      snapshot,
      cursor,
      forMap: false,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const ids = page.map((r) => r.id);
    const { covers, walkthroughs } = await this.loadMediaHints(ids);

    const items: ExploreCard[] = page.map((l) => this.toCard(l, covers, walkthroughs));

    let nextCursor: string | null = null;
    if (hasMore && page.length > 0) {
      const last = page[page.length - 1];
      nextCursor = encodeExploreCursor(this.buildNextCursor(sort, snapshot, last));
    }

    const envelope: ExploreListEnvelope = {
      items,
      pagination: { next_cursor: nextCursor, has_more: hasMore },
      meta: {
        query_ms: Date.now() - started,
        sort,
        cache: 'miss',
        total_estimate: null,
      },
    };

    await this.safeCacheSet(cacheKey, envelope, ttl);
    this.metrics.recordExploreQueryMs(Date.now() - started);
    this.logger.debug(
      `explore list items=${items.length} has_more=${hasMore} ms=${envelope.meta.query_ms}`,
    );
    return envelope;
  }

  async exploreMap(params: ExploreQueryParams): Promise<ExploreMapEnvelope> {
    const started = Date.now();
    if (
      params.north == null ||
      params.south == null ||
      params.east == null ||
      params.west == null
    ) {
      throw new BadRequestException({
        code: 'invalid_bounds',
        message: 'Map explore requires north, south, east, and west.',
      });
    }

    const boundsCheck = this.validateBounds(
      params.north,
      params.south,
      params.east,
      params.west,
      { allowTruncate: true },
    );

    const bounds = {
      north: params.north,
      south: params.south,
      east: params.east,
      west: params.west,
    };

    const cacheKey = this.buildCacheKey('map', { ...params, sort: 'newest' });
    const dated = Boolean(params.checkin_date && params.checkout_date);
    const ttl = dated ? CACHE_TTL_DATED_MS : CACHE_TTL_MS;

    const cached = await this.safeCacheGet<ExploreMapEnvelope>(cacheKey);
    if (cached) {
      this.metrics.incrementExploreCacheHit();
      return {
        ...cached,
        meta: { ...cached.meta, query_ms: Date.now() - started, cache: 'hit' },
      };
    }
    this.metrics.incrementExploreCacheMiss();

    const rows = await this.queryListings({
      ...params,
      sort: 'newest',
      limit: MAP_PIN_MAX + 1,
      snapshot: nowSnapshotIso(),
      cursor: null,
      forMap: true,
    });

    const truncated =
      boundsCheck.forceTruncate || rows.length > MAP_PIN_MAX;
    const page = truncated ? rows.slice(0, MAP_PIN_MAX) : rows;
    const ids = page.map((r) => r.id);
    const { covers, walkthroughs } = await this.loadMediaHints(ids);

    const items: ExploreMapPin[] = page
      .filter((l) => l.geo_lat != null && l.geo_lng != null)
      .map((l) => this.toMapPin(l, covers, walkthroughs));

    const envelope: ExploreMapEnvelope = {
      items,
      bounds,
      truncated,
      meta: {
        query_ms: Date.now() - started,
        cache: 'miss',
      },
    };

    await this.safeCacheSet(cacheKey, envelope, ttl);
    this.metrics.recordExploreMapQueryMs(Date.now() - started);
    this.logger.debug(
      `explore map pins=${items.length} truncated=${truncated} ms=${envelope.meta.query_ms}`,
    );
    return envelope;
  }

  private validateBounds(
    north: number,
    south: number,
    east: number,
    west: number,
    opts: { allowTruncate: boolean },
  ): { forceTruncate: boolean } {
    if (
      ![north, south, east, west].every((n) => Number.isFinite(n)) ||
      north < -90 ||
      north > 90 ||
      south < -90 ||
      south > 90 ||
      east < -180 ||
      east > 180 ||
      west < -180 ||
      west > 180
    ) {
      throw new BadRequestException({
        code: 'invalid_bounds',
        message: 'Bounds must be finite latitudes/longitudes in range.',
      });
    }
    if (north <= south) {
      throw new BadRequestException({
        code: 'invalid_bounds',
        message: 'north must be greater than south.',
      });
    }
    if (east === west) {
      throw new BadRequestException({
        code: 'invalid_bounds',
        message: 'east and west must define a non-zero width.',
      });
    }

    const latSpan = north - south;
    const lngSpan = Math.abs(east - west);
    if (latSpan > MAX_BOUNDS_SPAN_DEG || lngSpan > MAX_BOUNDS_SPAN_DEG) {
      if (opts.allowTruncate) {
        return { forceTruncate: true };
      }
      throw new BadRequestException({
        code: 'invalid_bounds',
        message: `Map bounds span too large (max ${MAX_BOUNDS_SPAN_DEG}°). Zoom in and try again.`,
      });
    }
    return { forceTruncate: false };
  }

  private async queryListings(opts: {
    city?: string;
    checkin_date?: string;
    checkout_date?: string;
    guests?: number;
    verified_walkthrough_only?: boolean;
    instant_booking_only?: boolean;
    listing_type?: string;
    north?: number;
    south?: number;
    east?: number;
    west?: number;
    sort: ExploreSort;
    limit: number;
    snapshot: string;
    cursor: ExploreCursorPayload | null;
    forMap: boolean;
  }): Promise<StaysListing[]> {
    const qb = this.listingRepo
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.rate_plan', 'rp')
      .leftJoinAndSelect('l.rules', 'rules')
      .where('l.status = :status', { status: 'LIVE' })
      .andWhere('l.created_at <= :snapshot', {
        snapshot: new Date(opts.snapshot),
      });

    if (opts.city?.trim()) {
      // Prefix match for index use (city picker / Explore).
      qb.andWhere('LOWER(l.city) LIKE LOWER(:city)', {
        city: `${opts.city.trim()}%`,
      });
    }

    if (opts.listing_type) {
      qb.andWhere('UPPER(l.listing_type) = UPPER(:listingType)', {
        listingType: opts.listing_type.trim(),
      });
    }

    if (opts.instant_booking_only) {
      qb.andWhere('l.instant_booking = true');
    }

    if (opts.guests != null && opts.guests > 0) {
      qb.andWhere('rules.max_guests >= :guests', { guests: opts.guests });
    }

    if (opts.verified_walkthrough_only) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM stays_listing_media m
          WHERE m.listing_id = l.id AND m.kind = 'WALKTHROUGH'
        )`,
      );
    }

    if (
      opts.north != null &&
      opts.south != null &&
      opts.east != null &&
      opts.west != null
    ) {
      qb.andWhere('l.geo_lat IS NOT NULL AND l.geo_lng IS NOT NULL');
      qb.andWhere('l.geo_lat BETWEEN :south AND :north', {
        south: opts.south,
        north: opts.north,
      });
      if (opts.west <= opts.east) {
        qb.andWhere('l.geo_lng BETWEEN :west AND :east', {
          west: opts.west,
          east: opts.east,
        });
      } else {
        // Antimeridian wrap (rare for Morocco; still handle)
        qb.andWhere(
          '(l.geo_lng >= :west OR l.geo_lng <= :east)',
          { west: opts.west, east: opts.east },
        );
      }
    }

    if (opts.forMap) {
      qb.andWhere('l.geo_lat IS NOT NULL AND l.geo_lng IS NOT NULL');
    }

    /*
     * KNOWN SCALABILITY LIMIT (launch-acceptable, not long-term):
     * Date filtering uses getUnavailableListingIds() then NOT IN (...).
     * Replace with correlated NOT EXISTS against bookings/blocks, or an
     * indexed availability calendar, before large-scale booking volume.
     * Prefer scoping unavailable lookups to candidate/bounds sets when feasible.
     * Ticket: replace-explore-availability-notin
     */
    if (opts.checkin_date && opts.checkout_date) {
      const checkin = opts.checkin_date.trim();
      const checkout = opts.checkout_date.trim();
      if (
        /^\d{4}-\d{2}-\d{2}$/.test(checkin) &&
        /^\d{4}-\d{2}-\d{2}$/.test(checkout) &&
        checkout > checkin
      ) {
        const unavailable =
          await this.availabilityService.getUnavailableListingIds(
            checkin,
            checkout,
          );
        if (unavailable.length > 0) {
          qb.andWhere('l.id NOT IN (:...unavailable)', { unavailable });
        }
      }
    }

    // Keyset pagination
    if (opts.cursor?.c && opts.cursor?.i) {
      if (opts.sort === 'newest') {
        qb.andWhere(
          '(l.created_at, l.id) < (:cursorCreated, :cursorId)',
          {
            cursorCreated: new Date(opts.cursor.c),
            cursorId: opts.cursor.i,
          },
        );
      } else {
        const r = opts.cursor.r ?? null;
        const n = opts.cursor.n ?? 0;
        // Ranking keyset: (avg_rating DESC NULLS LAST, review_count DESC, created_at DESC, id DESC)
        qb.andWhere(
          `(
            (l.avg_rating IS NULL AND :cursorRating IS NOT NULL)
            OR (l.avg_rating IS NOT NULL AND :cursorRating IS NOT NULL AND l.avg_rating < :cursorRating)
            OR (
              ((l.avg_rating IS NULL AND :cursorRating IS NULL) OR l.avg_rating = :cursorRating)
              AND (
                l.review_count < :cursorReviews
                OR (
                  l.review_count = :cursorReviews
                  AND (l.created_at, l.id) < (:cursorCreated, :cursorId)
                )
              )
            )
          )`,
          {
            cursorRating: r,
            cursorReviews: n,
            cursorCreated: new Date(opts.cursor.c),
            cursorId: opts.cursor.i,
          },
        );
      }
    }

    if (opts.sort === 'rating') {
      qb.orderBy('l.avg_rating', 'DESC', 'NULLS LAST')
        .addOrderBy('l.review_count', 'DESC')
        .addOrderBy('l.created_at', 'DESC')
        .addOrderBy('l.id', 'DESC');
    } else {
      qb.orderBy('l.created_at', 'DESC').addOrderBy('l.id', 'DESC');
    }

    qb.take(opts.limit);
    return qb.getMany();
  }

  private buildNextCursor(
    sort: ExploreSort,
    snapshot: string,
    last: StaysListing,
  ): ExploreCursorPayload {
    const base: ExploreCursorPayload = {
      v: 1,
      s: sort,
      snapshot,
      c: new Date(last.created_at).toISOString(),
      i: last.id,
    };
    if (sort === 'rating') {
      base.r =
        last.avg_rating != null ? Number(last.avg_rating) : null;
      base.n = last.review_count ?? 0;
    }
    return base;
  }

  private toMapPin(
    l: StaysListing,
    covers: Map<string, string>,
    walkthroughs: Set<string>,
  ): ExploreMapPin {
    const coverId = covers.get(l.id);
    const amenities = (l.rules?.amenities ?? []).map((a) =>
      String(a).toLowerCase(),
    );
    return {
      id: l.id,
      title: l.title,
      city: l.city,
      neighborhood: l.neighborhood,
      geo_lat: Number(l.geo_lat),
      geo_lng: Number(l.geo_lng),
      avg_rating: l.avg_rating != null ? Number(l.avg_rating) : null,
      review_count: l.review_count ?? 0,
      bedrooms: this.bedroomCount(l.property_details),
      max_guests: l.rules?.max_guests != null ? Number(l.rules.max_guests) : null,
      has_wifi: amenities.some(
        (a) => a === 'wifi' || a.includes('wifi') || a.includes('wi-fi'),
      ),
      has_walkthrough: walkthroughs.has(l.id),
      instant_booking: Boolean(l.instant_booking),
      price: l.rate_plan
        ? {
            base_price: Number(l.rate_plan.base_price),
            currency: l.rate_plan.currency || 'MAD',
          }
        : null,
      cover: coverId ? { asset_id: coverId, kind: 'PHOTO' } : null,
    };
  }

  private bedroomCount(
    details: Record<string, unknown> | null | undefined,
  ): number | null {
    if (!details || typeof details !== 'object') return null;
    const bedrooms = details.bedrooms;
    if (Array.isArray(bedrooms) && bedrooms.length > 0) return bedrooms.length;
    if (typeof bedrooms === 'number' && Number.isFinite(bedrooms)) {
      return bedrooms;
    }
    const count = details.bedroom_count ?? details.beds;
    if (typeof count === 'number' && Number.isFinite(count)) return count;
    return null;
  }

  private toCard(
    l: StaysListing,
    covers: Map<string, string>,
    walkthroughs: Set<string>,
  ): ExploreCard {
    const coverId = covers.get(l.id);
    return {
      id: l.id,
      title: l.title,
      city: l.city,
      neighborhood: l.neighborhood,
      listing_type: l.listing_type,
      geo_lat: l.geo_lat != null ? Number(l.geo_lat) : null,
      geo_lng: l.geo_lng != null ? Number(l.geo_lng) : null,
      avg_rating: l.avg_rating != null ? Number(l.avg_rating) : null,
      review_count: l.review_count ?? 0,
      instant_booking: Boolean(l.instant_booking),
      has_walkthrough: walkthroughs.has(l.id),
      placement: 'organic',
      price: l.rate_plan
        ? {
            base_price: Number(l.rate_plan.base_price),
            currency: l.rate_plan.currency || 'MAD',
          }
        : null,
      cover: coverId
        ? { asset_id: coverId, kind: 'PHOTO' }
        : null,
    };
  }

  private async loadMediaHints(listingIds: string[]): Promise<{
    covers: Map<string, string>;
    walkthroughs: Set<string>;
  }> {
    const covers = new Map<string, string>();
    const walkthroughs = new Set<string>();
    if (listingIds.length === 0) return { covers, walkthroughs };

    const photos = await this.mediaRepo
      .createQueryBuilder('m')
      .where('m.listing_id IN (:...ids)', { ids: listingIds })
      .andWhere('m.kind = :kind', { kind: 'PHOTO' })
      .orderBy('m.listing_id', 'ASC')
      .addOrderBy('m.sort_order', 'ASC')
      .getMany();

    for (const m of photos) {
      if (!covers.has(m.listing_id)) {
        covers.set(m.listing_id, m.asset_id);
      }
    }

    const walks = await this.mediaRepo
      .createQueryBuilder('m')
      .select('DISTINCT m.listing_id', 'listing_id')
      .where('m.listing_id IN (:...ids)', { ids: listingIds })
      .andWhere('m.kind = :kind', { kind: 'WALKTHROUGH' })
      .getRawMany<{ listing_id: string }>();

    for (const row of walks) {
      if (row.listing_id) walkthroughs.add(row.listing_id);
    }

    return { covers, walkthroughs };
  }

  private buildCacheKey(
    kind: 'list' | 'map',
    params: ExploreQueryParams & { sort?: ExploreSort; limit?: number },
  ): string {
    const normalized: Record<string, string> = { kind };
    const put = (k: string, v: string | number | boolean | undefined | null) => {
      if (v === undefined || v === null || v === '') return;
      if (typeof v === 'string' && v.trim() === '') return;
      // Drop defaults
      if (k === 'limit' && Number(v) === CARD_LIMIT_DEFAULT) return;
      if (k === 'sort' && v === 'newest') return;
      normalized[k] =
        typeof v === 'string' ? v.trim().toLowerCase() : String(v);
    };

    put('city', params.city);
    put('checkin_date', params.checkin_date);
    put('checkout_date', params.checkout_date);
    put('guests', params.guests);
    put('verified_walkthrough_only', params.verified_walkthrough_only);
    put('instant_booking_only', params.instant_booking_only);
    put('listing_type', params.listing_type);
    put('limit', params.limit);
    put('cursor', params.cursor);
    put('sort', params.sort);
    put('north', params.north);
    put('south', params.south);
    put('east', params.east);
    put('west', params.west);

    const stable = Object.keys(normalized)
      .sort()
      .map((k) => `${k}=${normalized[k]}`)
      .join('&');
    const hash = createHash('sha256').update(stable).digest('hex').slice(0, 32);
    return `explore:v1:${hash}`;
  }

  private async safeCacheGet<T>(key: string): Promise<T | null> {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  private async safeCacheSet(
    key: string,
    value: unknown,
    ttlMs: number,
  ): Promise<void> {
    try {
      const json = JSON.stringify(value);
      if (Buffer.byteLength(json, 'utf8') > CACHE_MAX_BYTES) {
        this.metrics.incrementExploreCacheBypass();
        this.logger.warn(`explore cache bypass: payload > ${CACHE_MAX_BYTES} bytes`);
        return;
      }
      // Bound memory: drop expired entries occasionally.
      if (this.memoryCache.size > 500) {
        const now = Date.now();
        for (const [k, v] of this.memoryCache) {
          if (now > v.expiresAt) this.memoryCache.delete(k);
        }
      }
      this.memoryCache.set(key, { expiresAt: Date.now() + ttlMs, value });
    } catch (err) {
      this.logger.warn(`explore cache set failed: ${String(err)}`);
    }
  }
}
