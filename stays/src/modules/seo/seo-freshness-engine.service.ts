import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeoDestination } from './entities/seo-destination.entity';
import { SeoPageRegistry } from './entities/seo-page-registry.entity';
import { DestinationIntelligenceService } from './destination-intelligence.service';
import { SeoPageRegistryService } from './seo-page-registry.service';
import {
  SEO_AMENITIES,
  SEO_LANDMARKS,
  SEO_NEIGHBORHOODS_BY_CITY,
  SEO_PROPERTY_TYPES,
  amenityToExploreFilters,
  landmarkToExploreFilters,
  neighborhoodToExploreFilters,
} from './seo-catalog';
import { computeSeoQualityScore, isPageIndexable } from './seo-quality-scoring.service';

@Injectable()
export class SeoFreshnessEngineService {
  private readonly logger = new Logger(SeoFreshnessEngineService.name);

  constructor(
    @InjectRepository(SeoDestination)
    private readonly destinationRepo: Repository<SeoDestination>,
    @InjectRepository(SeoPageRegistry)
    private readonly registryRepo: Repository<SeoPageRegistry>,
    private readonly intelligence: DestinationIntelligenceService,
    private readonly registry: SeoPageRegistryService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async refreshAllDestinations(): Promise<void> {
    await this.runRefresh();
  }

  @Cron(CronExpression.EVERY_HOUR)
  async refreshHourlyLight(): Promise<void> {
    if (process.env.SEO_FRESHNESS_HOURLY !== 'true') return;
    await this.runRefresh();
  }

  async runOnStartup(): Promise<void> {
    if (process.env.SEO_FRESHNESS_SYNC_ON_STARTUP === 'true') {
      await this.runRefresh();
    }
  }

  /** Refresh stats for a city when listings change. */
  async refreshForSearchCity(searchCity: string): Promise<void> {
    const dest = await this.destinationRepo.findOne({
      where: { search_city: searchCity, content_status: 'published' },
    });
    if (!dest) return;
    await this.refreshDestinationBundle(dest);
  }

  async runRefresh(): Promise<void> {
    const destinations = await this.destinationRepo.find({
      where: { content_status: 'published' },
    });
    const now = new Date();

    for (const dest of destinations) {
      try {
        await this.refreshDestinationBundle(dest, now);
      } catch (err) {
        this.logger.warn(
          `SEO freshness failed for ${dest.slug}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    for (const pt of SEO_PROPERTY_TYPES) {
      try {
        const intel = await this.intelligence.compute({
          listing_type: pt.listingType,
        });
        const score = computeSeoQualityScore({ intelligence: intel });
        const indexable = isPageIndexable({
          seoScore: score,
          listingCount: intel.listingCount,
        });
        await this.registry.syncPageAllLocales({
          pageType: 'property_type',
          slug: pt.slug,
          indexable,
          seoScore: score,
          lastmod: now,
        });
      } catch (err) {
        this.logger.warn(`SEO freshness property_type ${pt.slug}: ${err}`);
      }
    }

    for (const am of SEO_AMENITIES) {
      try {
        const intel = await this.intelligence.compute(amenityToExploreFilters(am));
        const score = computeSeoQualityScore({ intelligence: intel });
        const indexable = isPageIndexable({
          seoScore: score,
          listingCount: intel.listingCount,
        });
        await this.registry.syncPageAllLocales({
          pageType: 'amenity',
          slug: am.slug,
          indexable,
          seoScore: score,
          lastmod: now,
        });
      } catch (err) {
        this.logger.warn(`SEO freshness amenity ${am.slug}: ${err}`);
      }
    }

    for (const lm of SEO_LANDMARKS) {
      try {
        const intel = await this.intelligence.compute(landmarkToExploreFilters(lm));
        const score = computeSeoQualityScore({ intelligence: intel });
        const indexable = isPageIndexable({
          seoScore: score,
          listingCount: intel.listingCount,
        });
        await this.registry.syncPageAllLocales({
          pageType: 'landmark',
          slug: lm.urlSlug,
          indexable,
          seoScore: score,
          lastmod: now,
        });
      } catch (err) {
        this.logger.warn(`SEO freshness landmark ${lm.urlSlug}: ${err}`);
      }
    }

    this.logger.log(
      `SEO freshness refreshed ${destinations.length} destinations + combos + landmarks`,
    );
  }

  private async refreshDestinationBundle(
    dest: SeoDestination,
    now: Date = new Date(),
  ): Promise<void> {
    const cityIntel = await this.intelligence.compute({ city: dest.search_city });
    const cityScore = computeSeoQualityScore({
      intelligence: cityIntel,
      destination: dest,
    });
    const cityIndexable = isPageIndexable({
      seoScore: cityScore,
      listingCount: cityIntel.listingCount,
    });

    await this.destinationRepo.update(dest.id, {
      stats_cache_json: JSON.parse(JSON.stringify(cityIntel)),
      stats_refreshed_at: now,
      listing_count_cache: cityIntel.listingCount,
      seo_score: cityScore,
      indexable: cityIndexable,
    });

    await this.registry.syncPageAllLocales({
      pageType: 'city',
      slug: dest.slug,
      indexable: cityIndexable,
      seoScore: cityScore,
      lastmod: now,
    });

    for (const pt of SEO_PROPERTY_TYPES) {
      const intel = await this.intelligence.compute({
        city: dest.search_city,
        listing_type: pt.listingType,
      });
      const score = computeSeoQualityScore({
        intelligence: intel,
        destination: dest,
      });
      const indexable = isPageIndexable({
        seoScore: score,
        listingCount: intel.listingCount,
      });
      await this.registry.syncPageAllLocales({
        pageType: 'city_property_type',
        slug: `${dest.slug}/${pt.slug}`,
        indexable,
        seoScore: score,
        lastmod: now,
      });
    }

    for (const am of SEO_AMENITIES) {
      const intel = await this.intelligence.compute({
        city: dest.search_city,
        ...amenityToExploreFilters(am),
      });
      const score = computeSeoQualityScore({
        intelligence: intel,
        destination: dest,
      });
      const indexable = isPageIndexable({
        seoScore: score,
        listingCount: intel.listingCount,
      });
      await this.registry.syncPageAllLocales({
        pageType: 'city_amenity',
        slug: `${dest.slug}/${am.slug}`,
        indexable,
        seoScore: score,
        lastmod: now,
      });
    }

    const neighborhoods = SEO_NEIGHBORHOODS_BY_CITY[dest.slug] ?? [];
    for (const nb of neighborhoods) {
      const intel = await this.intelligence.compute(
        neighborhoodToExploreFilters(dest.search_city, nb),
      );
      const score = computeSeoQualityScore({
        intelligence: intel,
        destination: dest,
      });
      const indexable = isPageIndexable({
        seoScore: score,
        listingCount: intel.listingCount,
      });
      await this.registry.syncPageAllLocales({
        pageType: 'city_neighborhood',
        slug: `${dest.slug}/${nb.slug}`,
        indexable,
        seoScore: score,
        lastmod: now,
      });
    }
  }
}
