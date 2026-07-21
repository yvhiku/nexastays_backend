import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { StaysListing } from '../stays/entities/stays-listing.entity';
import { StaysListingMedia } from '../stays/entities/stays-listing-media.entity';
import { StaysListingRules } from '../stays/entities/stays-listing-rules.entity';
import { StaysRatePlan } from '../stays/entities/stays-rate-plan.entity';
import type { SeoExploreFilters } from './seo-catalog';
import type { DestinationIntelligence } from './seo.types';

const LUXURY_PRICE_MAD = 1500;

@Injectable()
export class DestinationIntelligenceService {
  constructor(
    @InjectRepository(StaysListing)
    private readonly listingRepo: Repository<StaysListing>,
  ) {}

  async computeForCity(searchCity: string): Promise<DestinationIntelligence> {
    return this.compute({ city: searchCity });
  }

  async compute(filters: SeoExploreFilters): Promise<DestinationIntelligence> {
    const baseQb = this.baseQuery(filters);

    const stats = await baseQb
      .clone()
      .select('COUNT(l.id)', 'listingCount')
      .addSelect('AVG(l.avg_rating)', 'avgRating')
      .addSelect('SUM(l.review_count)', 'reviewCount')
      .addSelect('MIN(rp.base_price)', 'minPrice')
      .addSelect('MAX(rp.base_price)', 'maxPrice')
      .addSelect('AVG(rp.base_price)', 'avgPrice')
      .addSelect(
        `SUM(CASE WHEN l.listing_type IN ('VILLA','RIAD') OR rp.base_price >= ${LUXURY_PRICE_MAD} THEN 1 ELSE 0 END)`,
        'luxuryCount',
      )
      .getRawOne<{
        listingCount: string;
        avgRating: string | null;
        reviewCount: string | null;
        minPrice: string | null;
        maxPrice: string | null;
        avgPrice: string | null;
        luxuryCount: string;
      }>();

    const listingCount = Number(stats?.listingCount ?? 0);
    const verifiedCount = await this.countVerified(filters);

    let topNeighborhood: string | null = null;
    if (filters.city?.trim()) {
      const neighborhoodRows = await this.baseQuery(filters)
        .select('l.neighborhood', 'neighborhood')
        .addSelect('COUNT(*)', 'cnt')
        .andWhere('l.neighborhood IS NOT NULL')
        .andWhere("TRIM(l.neighborhood) <> ''")
        .groupBy('l.neighborhood')
        .orderBy('cnt', 'DESC')
        .limit(1)
        .getRawOne<{ neighborhood: string }>();
      topNeighborhood = neighborhoodRows?.neighborhood?.trim() || null;
    }

    const amenityRows = await this.baseQuery(filters)
      .select('rules.amenities', 'amenities')
      .limit(200)
      .getRawMany<{ amenities: string[] }>();

    const amenityCounts = new Map<string, number>();
    for (const row of amenityRows) {
      for (const a of row.amenities ?? []) {
        const key = String(a).trim();
        if (!key) continue;
        amenityCounts.set(key, (amenityCounts.get(key) ?? 0) + 1);
      }
    }
    const topAmenities = [...amenityCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => this.formatAmenity(name));

    return {
      listingCount,
      verifiedCount,
      avgNightlyPrice: stats?.avgPrice != null ? Math.round(Number(stats.avgPrice)) : null,
      minPrice: stats?.minPrice != null ? Math.round(Number(stats.minPrice)) : null,
      maxPrice: stats?.maxPrice != null ? Math.round(Number(stats.maxPrice)) : null,
      luxuryCount: Number(stats?.luxuryCount ?? 0),
      avgRating:
        stats?.avgRating != null ? Math.round(Number(stats.avgRating) * 10) / 10 : null,
      reviewCount: Number(stats?.reviewCount ?? 0),
      topNeighborhood,
      bestMonth: null,
      topAmenities,
      currency: 'MAD',
    };
  }

  private baseQuery(filters: SeoExploreFilters): SelectQueryBuilder<StaysListing> {
    const qb = this.listingRepo
      .createQueryBuilder('l')
      .leftJoin(StaysRatePlan, 'rp', 'rp.listing_id = l.id')
      .leftJoin(StaysListingRules, 'rules', 'rules.listing_id = l.id')
      .where('l.status = :status', { status: 'LIVE' });

    if (filters.city?.trim()) {
      qb.andWhere('LOWER(l.city) LIKE LOWER(:city)', {
        city: `${filters.city.trim()}%`,
      });
    }

    if (filters.listing_type) {
      qb.andWhere('UPPER(l.listing_type) = UPPER(:listingType)', {
        listingType: filters.listing_type,
      });
    }

    if (filters.amenity?.trim()) {
      qb.andWhere(`rules.amenities @> :amenityJson`, {
        amenityJson: JSON.stringify([filters.amenity.trim()]),
      });
    }

    if (filters.pets_allowed) {
      qb.andWhere("rules.pets_policy IS NOT NULL AND rules.pets_policy <> 'NO'");
    }

    if (filters.family_friendly) {
      qb.andWhere('rules.max_guests >= :minGuests', { minGuests: 4 });
    }

    if (filters.luxury_only) {
      qb.andWhere(
        `(l.listing_type IN ('VILLA','RIAD') OR rp.base_price >= ${LUXURY_PRICE_MAD})`,
      );
    }

    if (filters.neighborhood?.trim()) {
      qb.andWhere('LOWER(l.neighborhood) LIKE LOWER(:neighborhood)', {
        neighborhood: `%${filters.neighborhood.trim()}%`,
      });
    }

    this.applyGeoRadiusFilter(qb, filters);

    return qb;
  }

  private applyGeoRadiusFilter(
    qb: SelectQueryBuilder<StaysListing>,
    filters: SeoExploreFilters,
  ): void {
    if (
      filters.near_lat == null ||
      filters.near_lng == null ||
      filters.near_radius_km == null
    ) {
      return;
    }
    const delta = filters.near_radius_km / 111;
    qb.andWhere('l.geo_lat IS NOT NULL AND l.geo_lng IS NOT NULL');
    qb.andWhere('l.geo_lat BETWEEN :minLat AND :maxLat', {
      minLat: filters.near_lat - delta,
      maxLat: filters.near_lat + delta,
    });
    qb.andWhere('l.geo_lng BETWEEN :minLng AND :maxLng', {
      minLng: filters.near_lng - delta,
      maxLng: filters.near_lng + delta,
    });
  }

  private async countVerified(filters: SeoExploreFilters): Promise<number> {
    const qb = this.listingRepo
      .createQueryBuilder('l')
      .innerJoin(
        StaysListingMedia,
        'm',
        "m.listing_id = l.id AND m.kind = 'WALKTHROUGH'",
      )
      .where('l.status = :status', { status: 'LIVE' });

    if (filters.city?.trim()) {
      qb.andWhere('LOWER(l.city) LIKE LOWER(:city)', {
        city: `${filters.city.trim()}%`,
      });
    }
    if (filters.listing_type) {
      qb.leftJoin(StaysListingRules, 'rules', 'rules.listing_id = l.id');
      qb.andWhere('UPPER(l.listing_type) = UPPER(:listingType)', {
        listingType: filters.listing_type,
      });
    }

    const row = await qb.select('COUNT(DISTINCT l.id)', 'cnt').getRawOne<{ cnt: string }>();
    return Number(row?.cnt ?? 0);
  }

  private formatAmenity(raw: string): string {
    return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
