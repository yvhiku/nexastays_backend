import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository, SelectQueryBuilder } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  StaysListing,
  StaysListingRules,
  StaysListingMedia,
  StaysListingUnitType,
  StaysRatePlan,
  StaysCheckInContact,
} from '../entities';
import { HostsService } from '../hosts/hosts.service';
import { detectImageType } from '../../../common/utils/image-type.util';
import { detectVideoType } from '../../../common/utils/video-type.util';
import { MediaStorageService } from '../../../common/media/media-storage.module';
import type { CreateDraftListingDto } from '../dto/create-draft-listing.dto';
import type { CreateHostListingDto } from '../dto/create-host-listing.dto';
import type { UpdateHostListingDto } from '../dto/update-host-listing.dto';
import type { ReplaceListingMediaDto } from '../dto/replace-listing-media.dto';
import type {
  HostListingSortParam,
  HostListingStatusFilterParam,
  HostListingsCountsQueryDto,
  HostListingsListQueryDto,
} from '../dto/host-listings-list.dto';
import {
  encodeHostListCursor,
  decodeHostListCursor,
} from '../utils/host-list-cursor.util';
import { escapeIlikePattern } from '../utils/host-bookings-list-sql.util';
import {
  assertCanSubmit,
  computeCompletionFlags,
  computeCompletionPercentage,
  listMissing,
  roomsRequiredForType,
} from '../listing-completion';

const PAUSABLE_STATUSES: StaysListing['status'][] = ['LIVE', 'APPROVED'];
const EDITABLE_STATUSES: StaysListing['status'][] = [
  'DRAFT',
  'REJECTED',
  'SUBMITTED',
  'APPROVED',
  'LIVE',
  'PAUSED',
];

const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

@Injectable()
export class HostListingsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly hostsService: HostsService,
    private readonly mediaStorage: MediaStorageService,
    @InjectRepository(StaysListing)
    private readonly listingRepo: Repository<StaysListing>,
    @InjectRepository(StaysListingRules)
    private readonly rulesRepo: Repository<StaysListingRules>,
    @InjectRepository(StaysRatePlan)
    private readonly ratePlanRepo: Repository<StaysRatePlan>,
    @InjectRepository(StaysCheckInContact)
    private readonly checkInContactRepo: Repository<StaysCheckInContact>,
    @InjectRepository(StaysListingMedia)
    private readonly mediaRepo: Repository<StaysListingMedia>,
    @InjectRepository(StaysListingUnitType)
    private readonly unitTypeRepo: Repository<StaysListingUnitType>,
  ) {}

  /**
   * Full summaries for analytics/dashboard backend — unbounded by design.
   * Portal list UI must use listHostListingsPage instead.
   */
  async getHostListings(userId: string) {
    const listings = await this.listingRepo.find({
      where: { host_user_id: userId },
      relations: ['rate_plan', 'rules', 'media', 'unit_types'],
      order: { created_at: 'DESC' },
    });
    return listings.map((l) => this.toHostListingSummary(l));
  }

  /** Slim id/title/city/status for selects (dashboard calendar, booking filters). */
  async getHostListingOptions(userId: string) {
    const rows = await this.listingRepo.find({
      where: { host_user_id: userId },
      select: ['id', 'title', 'city', 'status'],
      order: { title: 'ASC', id: 'ASC' },
    });
    return rows.map((l) => ({
      id: l.id,
      title: l.title,
      city: l.city,
      status: l.status,
    }));
  }

  /**
   * Two-phase cursor pagination:
   * 1) Keyset page on listing rows only (never OneToMany media in LIMIT).
   * 2) Hydrate rate_plan + media for those distinct IDs, then slim DTO.
   */
  async listHostListingsPage(userId: string, query: HostListingsListQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const status: HostListingStatusFilterParam = query.status ?? 'all';
    const sort: HostListingSortParam = query.sort ?? 'default';
    const search = (query.search ?? '').trim();

    const ctx = {
      kind: 'listings' as const,
      hostId: userId,
      sort,
      filter: '',
      search: search.toLowerCase(),
      listingId: '',
      status,
    };

    const cursorPayload = decodeHostListCursor(query.cursor, ctx);

    // Phase 1: distinct listings only — no media join (OneToMany multiplies LIMIT rows).
    const qb = this.listingRepo
      .createQueryBuilder('l')
      .where('l.host_user_id = :userId', { userId });

    // rate_plan is 1:1 — safe for price sort/keyset; still no media.
    if (sort === 'price') {
      qb.leftJoin('l.rate_plan', 'rate_plan');
    }

    this.applyListingStatusFilter(qb, status);
    if (search) {
      const pattern = `%${escapeIlikePattern(search.toLowerCase())}%`;
      qb.andWhere(
        `(
          LOWER(COALESCE(l.title, '')) LIKE :searchPattern ESCAPE '\\'
          OR LOWER(COALESCE(l.city, '')) LIKE :searchPattern ESCAPE '\\'
        )`,
        { searchPattern: pattern },
      );
    }

    qb.addSelect(
      'COALESCE(l.last_edited_at, l.updated_at)',
      'updated_sort',
    );
    if (sort === 'price') {
      qb.addSelect('rate_plan.base_price', 'price_sort');
    }

    this.applyListingOrder(qb, sort);
    this.applyListingKeyset(qb, sort, cursorPayload);
    qb.take(limit + 1);

    const { entities, raw } = await qb.getRawAndEntities();
    const hasNext = entities.length > limit;
    const pageEntities = hasNext ? entities.slice(0, limit) : entities;
    const pageRaw = hasNext ? raw.slice(0, limit) : raw;
    const pageIds = pageEntities.map((l) => l.id);

    // Phase 2: hydrate slim relations for the distinct page IDs only.
    const hydrated =
      pageIds.length === 0
        ? []
        : await this.listingRepo.find({
            where: { id: In(pageIds), host_user_id: userId },
            relations: ['rate_plan', 'media'],
          });
    const byId = new Map(hydrated.map((l) => [l.id, l]));
    const ordered = pageIds
      .map((id) => byId.get(id))
      .filter((l): l is StaysListing => !!l);

    const items = ordered.map((l) => this.toHostListingListItem(l));

    let nextCursor: string | null = null;
    if (hasNext && pageEntities.length > 0) {
      const last = pageEntities[pageEntities.length - 1];
      const lastRaw = (pageRaw[pageRaw.length - 1] ?? {}) as Record<
        string,
        unknown
      >;
      // Prefer hydrated rate_plan for price cursor when raw alias missing.
      const lastHydrated = byId.get(last.id) ?? last;
      nextCursor = encodeHostListCursor(
        ctx,
        this.listingCursorKeys(sort, lastHydrated, lastRaw),
        last.id,
      );
    }

    return {
      items,
      pagination: {
        limit,
        has_next: hasNext,
        next_cursor: nextCursor,
      },
    };
  }

  async getHostListingsCounts(
    userId: string,
    query: HostListingsCountsQueryDto,
  ) {
    const search = (query.search ?? '').trim();
    const statuses: HostListingStatusFilterParam[] = [
      'all',
      'active',
      'pending',
      'paused',
      'draft',
      'needs_changes',
    ];
    const counts: Record<string, number> = {};
    for (const status of statuses) {
      const qb = this.listingRepo
        .createQueryBuilder('l')
        .where('l.host_user_id = :userId', { userId });
      this.applyListingStatusFilter(qb, status);
      if (search) {
        const pattern = `%${escapeIlikePattern(search.toLowerCase())}%`;
        qb.andWhere(
          `(
            LOWER(COALESCE(l.title, '')) LIKE :searchPattern ESCAPE '\\'
            OR LOWER(COALESCE(l.city, '')) LIKE :searchPattern ESCAPE '\\'
          )`,
          { searchPattern: pattern },
        );
      }
      counts[status] = await qb.getCount();
    }
    return counts;
  }

  private applyListingStatusFilter(
    qb: SelectQueryBuilder<StaysListing>,
    status: HostListingStatusFilterParam,
  ) {
    switch (status) {
      case 'all':
        return;
      case 'active':
        qb.andWhere(`l.status IN ('LIVE', 'APPROVED')`);
        return;
      case 'pending':
        qb.andWhere(`l.status = 'SUBMITTED'`);
        return;
      case 'paused':
        qb.andWhere(`l.status = 'PAUSED'`);
        return;
      case 'draft':
        qb.andWhere(`l.status = 'DRAFT'`);
        return;
      case 'needs_changes':
        qb.andWhere(`l.status = 'REJECTED'`);
        return;
      default:
        return;
    }
  }

  private applyListingOrder(
    qb: SelectQueryBuilder<StaysListing>,
    sort: HostListingSortParam,
  ) {
    if (sort === 'default') {
      qb.orderBy('l.created_at', 'DESC');
      qb.addOrderBy('l.id', 'DESC');
      return;
    }
    if (sort === 'title') {
      qb.orderBy('l.title', 'ASC');
      qb.addOrderBy('l.id', 'ASC');
      return;
    }
    if (sort === 'city') {
      qb.orderBy('l.city', 'ASC');
      qb.addOrderBy('l.id', 'ASC');
      return;
    }
    if (sort === 'status') {
      qb.orderBy('l.status', 'ASC');
      qb.addOrderBy('l.id', 'ASC');
      return;
    }
    if (sort === 'updated') {
      // Client: missing last_edited_at sorts last; API uses COALESCE(last_edited_at, updated_at)
      // Newest first; NULLs last
      qb.orderBy('updated_sort', 'DESC', 'NULLS LAST');
      qb.addOrderBy('l.id', 'DESC');
      return;
    }
    if (sort === 'price') {
      // Client: null price sorts last; ASC among priced
      qb.orderBy('price_sort', 'ASC', 'NULLS LAST');
      qb.addOrderBy('l.id', 'ASC');
    }
  }

  private applyListingKeyset(
    qb: SelectQueryBuilder<StaysListing>,
    sort: HostListingSortParam,
    cursor: ReturnType<typeof decodeHostListCursor>,
  ) {
    if (!cursor) return;
    const k = cursor.keys;
    const id = cursor.id;

    if (sort === 'default') {
      // +1ms tie window: JS Date / toISOString is ms-only; PG timestamptz keeps µs.
      // Exact equality after round-trip fails for seed batches that share one created_at.
      const cCreated = new Date(String(k.created_at));
      const cCreatedEnd = new Date(cCreated.getTime() + 1);
      qb.andWhere(
        `(
          l.created_at < :cCreated
          OR (
            l.created_at >= :cCreated
            AND l.created_at < :cCreatedEnd
            AND l.id < :cId
          )
        )`,
        { cCreated, cCreatedEnd, cId: id },
      );
      return;
    }
    if (sort === 'title') {
      qb.andWhere(
        `(
          l.title > :cTitle
          OR (l.title = :cTitle AND l.id > :cId)
        )`,
        { cTitle: String(k.title ?? ''), cId: id },
      );
      return;
    }
    if (sort === 'city') {
      qb.andWhere(
        `(
          l.city > :cCity
          OR (l.city = :cCity AND l.id > :cId)
        )`,
        { cCity: String(k.city ?? ''), cId: id },
      );
      return;
    }
    if (sort === 'status') {
      qb.andWhere(
        `(
          l.status > :cStatus
          OR (l.status = :cStatus AND l.id > :cId)
        )`,
        { cStatus: String(k.status ?? ''), cId: id },
      );
      return;
    }
    if (sort === 'updated') {
      // DESC NULLS LAST keyset (+1ms window for timestamptz µs vs JS ms)
      if (k.updated_sort == null) {
        qb.andWhere(
          `(
            COALESCE(l.last_edited_at, l.updated_at) IS NULL
            AND l.id < :cId
          )`,
          { cId: id },
        );
      } else {
        const cUpdated = new Date(String(k.updated_sort));
        const cUpdatedEnd = new Date(cUpdated.getTime() + 1);
        qb.andWhere(
          `(
            COALESCE(l.last_edited_at, l.updated_at) < :cUpdated
            OR (
              COALESCE(l.last_edited_at, l.updated_at) >= :cUpdated
              AND COALESCE(l.last_edited_at, l.updated_at) < :cUpdatedEnd
              AND l.id < :cId
            )
            OR COALESCE(l.last_edited_at, l.updated_at) IS NULL
          )`,
          { cUpdated, cUpdatedEnd, cId: id },
        );
      }
      return;
    }
    if (sort === 'price') {
      if (k.price_sort == null) {
        qb.andWhere(
          `(rate_plan.base_price IS NULL AND l.id > :cId)`,
          { cId: id },
        );
      } else {
        qb.andWhere(
          `(
            rate_plan.base_price > :cPrice
            OR (rate_plan.base_price = :cPrice AND l.id > :cId)
            OR rate_plan.base_price IS NULL
          )`,
          { cPrice: Number(k.price_sort), cId: id },
        );
      }
    }
  }

  private listingCursorKeys(
    sort: HostListingSortParam,
    listing: StaysListing,
    raw: Record<string, unknown>,
  ): Record<string, string | number | null> {
    if (sort === 'default') {
      return {
        created_at:
          listing.created_at instanceof Date
            ? listing.created_at.toISOString()
            : String(listing.created_at),
      };
    }
    if (sort === 'title') return { title: listing.title };
    if (sort === 'city') return { city: listing.city };
    if (sort === 'status') return { status: listing.status };
    if (sort === 'updated') {
      const v =
        raw.updated_sort ?? listing.last_edited_at ?? listing.updated_at;
      return {
        updated_sort:
          v == null
            ? null
            : v instanceof Date
              ? v.toISOString()
              : String(v),
      };
    }
    const price = raw.price_sort ?? listing.rate_plan?.base_price;
    return {
      price_sort: price == null ? null : Number(price),
    };
  }

  /** Slim list item: cover media only (no full media[] / unit_types / rules). */
  private toHostListingListItem(listing: StaysListing) {
    const completion = this.completionPayload(listing);
    const media = listing.media || [];
    const photos = media.filter(
      (m) =>
        !m.kind ||
        String(m.kind).toUpperCase() === 'PHOTO' ||
        String(m.kind).toUpperCase() === 'IMAGE',
    );
    const pool = photos.length > 0 ? photos : media;
    const cover =
      pool.find((m) => m.is_cover) ??
      [...pool].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];

    return {
      id: listing.id,
      title: listing.title,
      listing_type: listing.listing_type,
      booking_model: listing.booking_model,
      city: listing.city,
      country: listing.country ?? 'MA',
      status: listing.status,
      last_edited_at: listing.last_edited_at ?? listing.updated_at,
      archived_at: listing.archived_at ?? null,
      ...completion,
      rate_plan: listing.rate_plan
        ? {
            base_price: Number(listing.rate_plan.base_price),
            weekend_price: listing.rate_plan.weekend_price
              ? Number(listing.rate_plan.weekend_price)
              : null,
            currency: listing.rate_plan.currency,
          }
        : null,
      cover_media: cover
        ? {
            asset_id: cover.asset_id,
            kind: cover.kind,
            sort_order: cover.sort_order ?? 0,
            is_cover: cover.is_cover ?? false,
          }
        : null,
      // Compat: single-element media array so existing listingCoverMediaUrl works
      media: cover
        ? [
            {
              asset_id: cover.asset_id,
              kind: cover.kind,
              sort_order: cover.sort_order ?? 0,
              category: cover.category ?? null,
              unit_type_id: cover.unit_type_id ?? null,
              is_cover: true,
            },
          ]
        : [],
      rules: null,
      unit_types: [],
      created_at: listing.created_at,
    };
  }

  async getHostListingById(userId: string, listingId: string) {
    const listing = await this.requireOwnedListing(userId, listingId, [
      'rate_plan',
      'rules',
      'media',
      'check_in_contact',
      'unit_types',
    ]);
    return this.toHostListingDetail(listing);
  }

  async updateListing(
    userId: string,
    listingId: string,
    dto: UpdateHostListingDto,
  ) {
    await this.assertCanList(userId);
    const listing = await this.requireOwnedListing(userId, listingId, [
      'rate_plan',
      'rules',
      'check_in_contact',
      'media',
      'unit_types',
    ]);
    if (!EDITABLE_STATUSES.includes(listing.status)) {
      throw new BadRequestException(
        'This listing cannot be edited in its current status.',
      );
    }

    // LIVE edit policy: property type immutable; location blocked on LIVE/APPROVED/PAUSED
    const locationLocked = ['LIVE', 'APPROVED', 'PAUSED'].includes(
      listing.status,
    );
    if (dto.listing_type != null && dto.listing_type !== listing.listing_type) {
      throw new BadRequestException(
        'Property type cannot be changed after the listing is created.',
      );
    }
    if (locationLocked) {
      const locationTouched =
        dto.city != null ||
        dto.address !== undefined ||
        dto.geo_lat !== undefined ||
        dto.geo_lng !== undefined ||
        dto.neighborhood !== undefined;
      if (locationTouched) {
        throw new BadRequestException(
          'Location changes on live listings require moderation. Contact support or wait for the next release.',
        );
      }
    }

    if (dto.title != null) listing.title = dto.title;
    if (dto.city != null && !locationLocked) listing.city = dto.city;
    if (dto.neighborhood !== undefined && !locationLocked) {
      listing.neighborhood = dto.neighborhood;
    }
    if (dto.address !== undefined && !locationLocked) {
      listing.address_encrypted = dto.address;
    }
    if (dto.geo_lat !== undefined && !locationLocked) listing.geo_lat = dto.geo_lat;
    if (dto.geo_lng !== undefined && !locationLocked) listing.geo_lng = dto.geo_lng;
    if (dto.description !== undefined) listing.description = dto.description;
    if (dto.checkin_time != null) listing.checkin_time = dto.checkin_time;
    if (dto.checkout_time != null) listing.checkout_time = dto.checkout_time;
    if (dto.instant_booking != null) listing.instant_booking = dto.instant_booking;
    if (dto.property_details != null) {
      listing.property_details = {
        ...(listing.property_details ?? {}),
        ...dto.property_details,
      };
    }
    if (dto.policies != null) {
      listing.policies = { ...(listing.policies ?? {}), ...dto.policies };
    }
    listing.last_edited_at = new Date();

    await this.listingRepo.save(listing);

    if (dto.rules && listing.rules) {
      if (dto.rules.pets_policy != null) {
        listing.rules.pets_policy = dto.rules.pets_policy;
      }
      if (dto.rules.smoking_policy != null) {
        listing.rules.smoking_policy = dto.rules.smoking_policy;
      }
      if (dto.rules.max_guests != null) {
        listing.rules.max_guests = dto.rules.max_guests;
      }
      if (dto.rules.amenities != null) {
        listing.rules.amenities = dto.rules.amenities;
      }
      if (dto.rules.cancellation_policy != null) {
        listing.rules.cancellation_policy = dto.rules.cancellation_policy;
      }
      await this.rulesRepo.save(listing.rules);
    }

    if (dto.rate_plan && listing.rate_plan) {
      if (dto.rate_plan.currency != null) {
        listing.rate_plan.currency = dto.rate_plan.currency;
      }
      if (dto.rate_plan.base_price != null) {
        listing.rate_plan.base_price = dto.rate_plan.base_price;
      }
      if (dto.rate_plan.weekend_price !== undefined) {
        listing.rate_plan.weekend_price = dto.rate_plan.weekend_price ?? null;
      }
      await this.ratePlanRepo.save(listing.rate_plan);

      // Keep the default entire-place unit in sync so inventory price matches rate plan.
      if (
        dto.rate_plan.base_price != null &&
        !roomsRequiredForType(listing.listing_type, listing.booking_model)
      ) {
        const units = await this.unitTypeRepo.find({
          where: { listing_id: listing.id },
          order: { sort_order: 'ASC' },
        });
        if (units.length === 1) {
          units[0].base_price = dto.rate_plan.base_price;
          await this.unitTypeRepo.save(units[0]);
        }
      }
    }

    if (dto.check_in_contact && listing.check_in_contact) {
      if (dto.check_in_contact.full_name != null) {
        listing.check_in_contact.full_name = dto.check_in_contact.full_name;
      }
      if (dto.check_in_contact.phone != null) {
        listing.check_in_contact.phone_encrypted = dto.check_in_contact.phone;
      }
      if (dto.check_in_contact.role != null) {
        listing.check_in_contact.role = dto.check_in_contact.role;
      }
      if (dto.check_in_contact.access_instructions !== undefined) {
        listing.check_in_contact.access_instructions =
          dto.check_in_contact.access_instructions ?? null;
      }
      await this.checkInContactRepo.save(listing.check_in_contact);
    }

    const refreshed = await this.requireOwnedListing(userId, listingId, [
      'rate_plan',
      'rules',
      'check_in_contact',
      'media',
      'unit_types',
    ]);
    return this.toHostListingDetail(refreshed);
  }

  async pauseListing(userId: string, listingId: string) {
    const listing = await this.requireOwnedListing(userId, listingId);
    if (!PAUSABLE_STATUSES.includes(listing.status)) {
      throw new BadRequestException(
        'Only live or approved listings can be paused.',
      );
    }
    listing.status = 'PAUSED';
    await this.listingRepo.save(listing);
    return {
      id: listing.id,
      status: listing.status,
      message: 'Listing paused and hidden from search results.',
    };
  }

  async resumeListing(userId: string, listingId: string) {
    await this.assertCanList(userId);
    const listing = await this.requireOwnedListing(userId, listingId);
    if (listing.status !== 'PAUSED') {
      throw new BadRequestException('Only paused listings can be resumed.');
    }
    listing.status = 'LIVE';
    await this.listingRepo.save(listing);
    return {
      id: listing.id,
      status: listing.status,
      message: 'Listing is live again and visible in search.',
    };
  }

  private async requireOwnedListing(
    userId: string,
    listingId: string,
    relations: string[] = [],
  ): Promise<StaysListing> {
    const listing = await this.listingRepo.findOne({
      where: { id: listingId },
      relations,
    });
    // Anti-enumeration: missing and cross-host both look like NotFound (H17).
    if (!listing || listing.host_user_id !== userId) {
      throw new NotFoundException('Listing not found');
    }
    return listing;
  }

  private completionPayload(listing: StaysListing) {
    const photos = (listing.media || []).filter((m) => m.kind === 'PHOTO');
    const hasWalkthrough = (listing.media || []).some(
      (m) => m.kind === 'WALKTHROUGH',
    );
    const units = listing.unit_types || [];
    const roomsNeeded = roomsRequiredForType(
      listing.listing_type,
      listing.booking_model,
    );
    const ratePrice = Number(listing.rate_plan?.base_price ?? 0);
    const unitPrices = units
      .map((u) => Number(u.base_price) || 0)
      .filter((n) => n > 0);
    // Entire-place drafts keep a placeholder unit at 0 — use rate plan price.
    // Hotels/hostels: price comes from configured unit types.
    const effectivePrice = roomsNeeded
      ? unitPrices.length
        ? Math.min(...unitPrices)
        : 0
      : ratePrice > 0
        ? ratePrice
        : unitPrices.length
          ? Math.min(...unitPrices)
          : 0;
    const flags = computeCompletionFlags({
      listing_type: listing.listing_type,
      booking_model: listing.booking_model,
      title: listing.title,
      city: listing.city,
      address: listing.address_encrypted,
      geo_lat: listing.geo_lat != null ? Number(listing.geo_lat) : null,
      geo_lng: listing.geo_lng != null ? Number(listing.geo_lng) : null,
      description: listing.description,
      max_guests: listing.rules?.max_guests ?? null,
      base_price: effectivePrice,
      photo_count: photos.length,
      has_walkthrough: hasWalkthrough,
      unit_count: units.length,
      amenities_count: listing.rules?.amenities?.length ?? 0,
      has_house_rules_touch: Boolean(
        listing.rules?.pets_policy || listing.rules?.smoking_policy,
      ),
    });
    return {
      completion_flags: flags,
      completion_percentage: computeCompletionPercentage(flags),
      missing: listMissing(flags),
    };
  }

  private toHostListingSummary(listing: StaysListing) {
    const completion = this.completionPayload(listing);
    return {
      id: listing.id,
      title: listing.title,
      listing_type: listing.listing_type,
      booking_model: listing.booking_model,
      city: listing.city,
      country: listing.country ?? 'MA',
      neighborhood: listing.neighborhood,
      postal_code: listing.postal_code,
      building_name: listing.building_name,
      landmark: listing.landmark,
      status: listing.status,
      description: listing.description,
      checkin_time: listing.checkin_time,
      checkout_time: listing.checkout_time,
      instant_booking: listing.instant_booking,
      address: listing.address_encrypted,
      geo_lat: listing.geo_lat != null ? Number(listing.geo_lat) : null,
      geo_lng: listing.geo_lng != null ? Number(listing.geo_lng) : null,
      property_details: listing.property_details ?? {},
      safety_features: listing.safety_features ?? {},
      policies: listing.policies ?? {},
      last_edited_at: listing.last_edited_at ?? listing.updated_at,
      archived_at: listing.archived_at ?? null,
      ...completion,
      rate_plan: listing.rate_plan
        ? {
            base_price: Number(listing.rate_plan.base_price),
            weekend_price: listing.rate_plan.weekend_price
              ? Number(listing.rate_plan.weekend_price)
              : null,
            currency: listing.rate_plan.currency,
          }
        : null,
      rules: listing.rules
        ? {
            max_guests: listing.rules.max_guests,
            pets_policy: listing.rules.pets_policy,
            smoking_policy: listing.rules.smoking_policy,
            amenities: listing.rules.amenities,
            cancellation_policy: listing.rules.cancellation_policy,
            quiet_hours: listing.rules.quiet_hours,
            couples_welcome: listing.rules.couples_welcome,
          }
        : null,
      media: (listing.media || [])
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((m) => ({
          asset_id: m.asset_id,
          kind: m.kind,
          sort_order: m.sort_order ?? 0,
          category: m.category ?? null,
          unit_type_id: m.unit_type_id ?? null,
          is_cover: m.is_cover ?? false,
        })),
      unit_types: (listing.unit_types || [])
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((u) => ({
          id: u.id,
          kind: u.kind,
          name: u.name,
          quantity: u.quantity,
          max_guests: u.max_guests,
          bed_config: u.bed_config ?? [],
          size_sqm: u.size_sqm != null ? Number(u.size_sqm) : null,
          amenities: u.amenities ?? [],
          pricing_unit: u.pricing_unit,
          base_price: Number(u.base_price),
          currency: u.currency,
          details: u.details ?? {},
          sort_order: u.sort_order,
          is_active: u.is_active,
        })),
      created_at: listing.created_at,
    };
  }

  private toHostListingDetail(listing: StaysListing) {
    const contact = listing.check_in_contact;
    return {
      ...this.toHostListingSummary(listing),
      check_in_contact: contact
        ? {
            full_name: contact.full_name,
            phone: contact.phone_encrypted,
            role: contact.role,
            access_instructions: contact.access_instructions,
          }
        : null,
    };
  }

  private assertCanList(userId: string) {
    return this.hostsService.canList(userId).then(async (canList) => {
      if (canList) return;
      const profile = await this.hostsService.getHostProfileOrNull(userId);
      if (profile?.listing_frozen) {
        throw new BadRequestException(
          'Your host account is temporarily frozen. You can still book stays. Contact support to restore listing access.',
        );
      }
      throw new BadRequestException(
        'Host verification required. Your host application must be approved before creating listings.',
      );
    });
  }

  /** Type-first DRAFT create (no media required). */
  async createListing(userId: string, dto: CreateDraftListingDto) {
    await this.assertCanList(userId);
    const hostProfile = await this.hostsService.getHostProfileOrNull(userId);
    const hostName = (hostProfile?.full_name ?? '').trim();
    const hostPhone = (hostProfile?.phone ?? '').trim();

    const defaultBookingModel =
      dto.listing_type === 'HOTEL'
        ? 'ROOM_TYPES'
        : dto.listing_type === 'HOSTEL'
          ? 'DORM_AND_PRIVATE'
          : 'ENTIRE_PROPERTY';

    const propertyDetails = {
      ...(dto.property_details ?? {}),
      ...(dto.guest_house ? { guest_house: true } : {}),
    };

    return this.dataSource.transaction(async (manager) => {
      const listingRepo = manager.getRepository(StaysListing);
      const rulesRepo = manager.getRepository(StaysListingRules);
      const ratePlanRepo = manager.getRepository(StaysRatePlan);
      const checkInRepo = manager.getRepository(StaysCheckInContact);
      const unitTypeRepo = manager.getRepository(StaysListingUnitType);

      const now = new Date();
      const listing = listingRepo.create({
        host_user_id: userId,
        title: 'Untitled listing',
        listing_type: dto.listing_type,
        booking_model: defaultBookingModel,
        city: '',
        country: 'MA',
        neighborhood: null,
        postal_code: null,
        building_name: null,
        landmark: null,
        address_encrypted: null,
        geo_lat: null,
        geo_lng: null,
        property_details: propertyDetails,
        safety_features: {},
        policies: {},
        status: 'DRAFT',
        checkin_time: '14:00',
        checkout_time: '11:00',
        description: null,
        instant_booking: false,
        last_edited_at: now,
        archived_at: null,
      });
      await listingRepo.save(listing);

      await rulesRepo.save(
        rulesRepo.create({
          listing_id: listing.id,
          pets_policy: 'NO',
          smoking_policy: 'NOT_ALLOWED',
          quiet_hours: false,
          couples_welcome: true,
          max_guests: 2,
          amenities: [],
          cancellation_policy: 'MODERATE',
        }),
      );

      await ratePlanRepo.save(
        ratePlanRepo.create({
          listing_id: listing.id,
          currency: 'MAD',
          base_price: 0,
          weekend_price: null,
          deposit_policy_text: null,
        }),
      );

      await checkInRepo.save(
        checkInRepo.create({
          listing_id: listing.id,
          full_name: hostName,
          phone_encrypted: hostPhone,
          role: 'OWNER',
          access_instructions: null,
        }),
      );

      if (!roomsRequiredForType(dto.listing_type, defaultBookingModel)) {
        const kind =
          dto.listing_type === 'VILLA'
            ? ('VILLA_UNIT' as const)
            : dto.listing_type === 'RIAD'
              ? ('RIAD_ROOM' as const)
              : ('APARTMENT_UNIT' as const);
        await unitTypeRepo.save(
          unitTypeRepo.create({
            listing_id: listing.id,
            kind,
            name: 'Entire place',
            quantity: 1,
            max_guests: 2,
            bed_config: [],
            size_sqm: null,
            amenities: [],
            pricing_unit: 'NIGHT',
            base_price: 0,
            currency: 'MAD',
            details: {},
            sort_order: 0,
            is_active: true,
          }),
        );
      }

      return {
        id: listing.id,
        status: 'DRAFT' as const,
        message: 'Draft listing created. Continue editing to submit for review.',
      };
    });
  }

  /** Legacy full create kept for compatibility — prefer createListing draft + submit. */
  async createListingLegacy(userId: string, dto: CreateHostListingDto) {
    const draft = await this.createListing(userId, {
      listing_type: dto.listing_type,
      property_details: dto.property_details,
    });
    await this.updateListing(userId, draft.id, {
      title: dto.title,
      city: dto.city,
      neighborhood: dto.neighborhood,
      address: dto.address,
      geo_lat: dto.geo_lat,
      geo_lng: dto.geo_lng,
      description: dto.description,
      checkin_time: dto.checkin_time,
      checkout_time: dto.checkout_time,
      instant_booking: dto.instant_booking,
      property_details: dto.property_details,
      rules: dto.rules,
      rate_plan: dto.rate_plan,
      check_in_contact: dto.check_in_contact,
    });
    if (dto.media?.length) {
      await this.replaceListingMedia(userId, draft.id, { media: dto.media });
    }
    return this.submitListing(userId, draft.id);
  }

  async replaceListingMedia(
    userId: string,
    listingId: string,
    dto: ReplaceListingMediaDto,
  ) {
    await this.assertCanList(userId);
    const listing = await this.requireOwnedListing(userId, listingId, ['media']);
    if (!EDITABLE_STATUSES.includes(listing.status)) {
      throw new BadRequestException(
        'Media cannot be changed in the current listing status.',
      );
    }
    for (const m of dto.media) {
      await this.assertOwnedListingAsset(userId, m.asset_id, m.kind);
    }

    await this.dataSource.transaction(async (manager) => {
      const mediaRepo = manager.getRepository(StaysListingMedia);
      await mediaRepo.delete({ listing_id: listingId });
      for (let i = 0; i < dto.media.length; i++) {
        const m = dto.media[i];
        await mediaRepo.save(
          mediaRepo.create({
            listing_id: listingId,
            kind: m.kind,
            asset_id: m.asset_id,
            sort_order: m.sort_order ?? i,
            is_required: m.kind === 'WALKTHROUGH',
            category: m.category ?? null,
            is_cover: m.is_cover ?? false,
          }),
        );
      }
      await manager.getRepository(StaysListing).update(listingId, {
        last_edited_at: new Date(),
      });
    });

    return this.getHostListingById(userId, listingId);
  }

  async replaceListingUnitTypes(
    userId: string,
    listingId: string,
    dto: { unit_types: Array<{
      kind: string;
      name: string;
      quantity?: number;
      max_guests?: number;
      base_price: number;
      currency?: string;
      pricing_unit?: string;
      amenities?: string[];
      details?: Record<string, unknown>;
      sort_order?: number;
      is_active?: boolean;
    }> },
  ) {
    await this.assertCanList(userId);
    const listing = await this.requireOwnedListing(userId, listingId);
    if (!EDITABLE_STATUSES.includes(listing.status)) {
      throw new BadRequestException(
        'Unit types cannot be changed in the current listing status.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const unitRepo = manager.getRepository(StaysListingUnitType);
      await unitRepo.delete({ listing_id: listingId });
      for (let i = 0; i < dto.unit_types.length; i++) {
        const u = dto.unit_types[i];
        await unitRepo.save(
          unitRepo.create({
            listing_id: listingId,
            kind: u.kind as StaysListingUnitType['kind'],
            name: u.name,
            quantity: u.quantity ?? 1,
            max_guests: u.max_guests ?? 2,
            bed_config: [],
            size_sqm: null,
            amenities: u.amenities ?? [],
            pricing_unit: (u.pricing_unit as StaysListingUnitType['pricing_unit']) ?? 'NIGHT',
            base_price: u.base_price,
            currency: u.currency ?? 'MAD',
            details: u.details ?? {},
            sort_order: u.sort_order ?? i,
            is_active: u.is_active ?? true,
          }),
        );
      }
      const minPrice =
        dto.unit_types.length > 0
          ? Math.min(...dto.unit_types.map((x) => x.base_price))
          : 0;
      await manager.getRepository(StaysRatePlan).update(
        { listing_id: listingId },
        { base_price: minPrice },
      );
      await manager.getRepository(StaysListing).update(listingId, {
        last_edited_at: new Date(),
      });
    });

    return this.getHostListingById(userId, listingId);
  }

  async submitListing(userId: string, listingId: string) {
    await this.assertCanList(userId);
    const listing = await this.requireOwnedListing(userId, listingId, [
      'rate_plan',
      'rules',
      'media',
      'unit_types',
      'check_in_contact',
    ]);
    if (listing.status !== 'DRAFT' && listing.status !== 'REJECTED') {
      throw new BadRequestException(
        'Only draft listings (or listings that need changes) can be submitted.',
      );
    }
    if (listing.archived_at) {
      throw new BadRequestException('This draft has been archived.');
    }

    const completion = this.completionPayload(listing);
    const err = assertCanSubmit(completion.completion_flags);
    if (err) throw new BadRequestException(err);

    // Hotel/hostel: each unit must have price > 0
    if (
      roomsRequiredForType(listing.listing_type, listing.booking_model) &&
      (listing.unit_types || []).some((u) => Number(u.base_price) <= 0)
    ) {
      throw new BadRequestException(
        'Each room type needs a price greater than zero.',
      );
    }

    listing.status = 'SUBMITTED';
    listing.last_edited_at = new Date();
    await this.listingRepo.save(listing);

    return {
      id: listing.id,
      status: 'SUBMITTED' as const,
      message:
        'Listing submitted for review. Our team will review it within 1–2 business days.',
      completion_percentage: completion.completion_percentage,
    };
  }

  // --- media uploads (MediaStorageService) ---
  private listingMediaCandidates(
    userId: string,
    assetId: string,
    kind: string,
  ): string[] {
    const prefixes =
      kind === 'WALKTHROUGH'
        ? [`walkthrough_${assetId}`]
        : [`photo_${assetId}`];
    const exts =
      kind === 'WALKTHROUGH'
        ? ['.mp4', '.webm']
        : ['.jpg', '.jpeg', '.png', '.webp'];
    const keys: string[] = [];
    for (const prefix of prefixes) {
      for (const ext of exts) {
        keys.push(`host/${userId}/listing/${prefix}${ext}`);
      }
    }
    return keys;
  }

  private async assertOwnedListingAsset(
    userId: string,
    assetId: string,
    kind: string,
  ): Promise<void> {
    const found = await this.mediaStorage.resolveFirstExisting(
      this.listingMediaCandidates(userId, assetId, kind),
    );
    if (!found) {
      throw new BadRequestException(
        'Invalid media asset_id — upload the file first as this host',
      );
    }
  }

  async uploadListingPhoto(
    userId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ asset_id: string }> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('No file uploaded');
    }
    if (file.size > MAX_PHOTO_SIZE) {
      throw new BadRequestException(`Photo too large. Max ${MAX_PHOTO_SIZE / 1024 / 1024}MB`);
    }
    const detected = detectImageType(file.buffer);
    if (!detected) {
      throw new BadRequestException('Invalid image. Use JPEG, PNG, or WebP');
    }
    const ext = detected === 'png' ? '.png' : detected === 'webp' ? '.webp' : '.jpg';
    const mime =
      detected === 'png'
        ? 'image/png'
        : detected === 'webp'
          ? 'image/webp'
          : 'image/jpeg';
    const assetId = randomUUID();
    await this.mediaStorage.store({
      buffer: file.buffer,
      relativeKey: `host/${userId}/listing/photo_${assetId}${ext}`,
      mimeType: mime,
      assetId,
    });
    return { asset_id: assetId };
  }

  async uploadListingWalkthrough(
    userId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ asset_id: string }> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('No file uploaded');
    }
    if (file.size > MAX_VIDEO_SIZE) {
      throw new BadRequestException(`Video too large. Max ${MAX_VIDEO_SIZE / 1024 / 1024}MB`);
    }
    const detected = detectVideoType(file.buffer);
    if (!detected) {
      throw new BadRequestException(
        'Invalid video file. Only MP4/MOV (ftyp) or WebM are allowed.',
      );
    }
    const assetId = randomUUID();
    const ext = detected === 'webm' ? '.webm' : '.mp4';
    const mime = detected === 'webm' ? 'video/webm' : 'video/mp4';
    await this.mediaStorage.store({
      buffer: file.buffer,
      relativeKey: `host/${userId}/listing/walkthrough_${assetId}${ext}`,
      mimeType: mime,
      assetId,
    });
    return { asset_id: assetId };
  }
}
