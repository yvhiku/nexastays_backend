import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaysListing } from '../stays/entities/stays-listing.entity';
import { StaysListingMedia } from '../stays/entities/stays-listing-media.entity';
import { StaysListingRules } from '../stays/entities/stays-listing-rules.entity';
import { StaysRatePlan } from '../stays/entities/stays-rate-plan.entity';
import type { DestinationIntelligence } from './seo.types';

const LUXURY_PRICE_MAD = 1500;

@Injectable()
export class DestinationIntelligenceService {
  constructor(
    @InjectRepository(StaysListing)
    private readonly listingRepo: Repository<StaysListing>,
  ) {}

  async computeForCity(searchCity: string): Promise<DestinationIntelligence> {
    const cityPrefix = searchCity.trim();
    if (!cityPrefix) {
      return this.emptyIntelligence();
    }

    const qb = this.listingRepo
      .createQueryBuilder('l')
      .leftJoin(StaysRatePlan, 'rp', 'rp.listing_id = l.id')
      .leftJoin(StaysListingRules, 'rules', 'rules.listing_id = l.id')
      .where('l.status = :status', { status: 'LIVE' })
      .andWhere('LOWER(l.city) LIKE LOWER(:city)', { city: `${cityPrefix}%` });

    const stats = await qb
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
    const verifiedCount = await this.countVerified(cityPrefix);

    const neighborhoodRows = await this.listingRepo
      .createQueryBuilder('l')
      .select('l.neighborhood', 'neighborhood')
      .addSelect('COUNT(*)', 'cnt')
      .where('l.status = :status', { status: 'LIVE' })
      .andWhere('LOWER(l.city) LIKE LOWER(:city)', { city: `${cityPrefix}%` })
      .andWhere('l.neighborhood IS NOT NULL')
      .andWhere("TRIM(l.neighborhood) <> ''")
      .groupBy('l.neighborhood')
      .orderBy('cnt', 'DESC')
      .limit(1)
      .getRawOne<{ neighborhood: string }>();

    const amenityRows = await this.listingRepo
      .createQueryBuilder('l')
      .innerJoin(StaysListingRules, 'rules', 'rules.listing_id = l.id')
      .select('rules.amenities', 'amenities')
      .where('l.status = :status', { status: 'LIVE' })
      .andWhere('LOWER(l.city) LIKE LOWER(:city)', { city: `${cityPrefix}%` })
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
      topNeighborhood: neighborhoodRows?.neighborhood?.trim() || null,
      bestMonth: null,
      topAmenities,
      currency: 'MAD',
    };
  }

  private async countVerified(cityPrefix: string): Promise<number> {
    const row = await this.listingRepo
      .createQueryBuilder('l')
      .innerJoin(
        StaysListingMedia,
        'm',
        "m.listing_id = l.id AND m.kind = 'WALKTHROUGH'",
      )
      .where('l.status = :status', { status: 'LIVE' })
      .andWhere('LOWER(l.city) LIKE LOWER(:city)', { city: `${cityPrefix}%` })
      .select('COUNT(DISTINCT l.id)', 'cnt')
      .getRawOne<{ cnt: string }>();
    return Number(row?.cnt ?? 0);
  }

  private formatAmenity(raw: string): string {
    return raw
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private emptyIntelligence(): DestinationIntelligence {
    return {
      listingCount: 0,
      verifiedCount: 0,
      avgNightlyPrice: null,
      minPrice: null,
      maxPrice: null,
      luxuryCount: 0,
      avgRating: null,
      reviewCount: 0,
      topNeighborhood: null,
      bestMonth: null,
      topAmenities: [],
      currency: 'MAD',
    };
  }
}
