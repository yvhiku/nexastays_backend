import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeoDestination } from './entities/seo-destination.entity';
import { DestinationIntelligenceService } from './destination-intelligence.service';
import { SeoPageRegistryService } from './seo-page-registry.service';

const MIN_LISTINGS_INDEXABLE = 3;

@Injectable()
export class SeoFreshnessEngineService {
  private readonly logger = new Logger(SeoFreshnessEngineService.name);

  constructor(
    @InjectRepository(SeoDestination)
    private readonly destinationRepo: Repository<SeoDestination>,
    private readonly intelligence: DestinationIntelligenceService,
    private readonly registry: SeoPageRegistryService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async refreshAllDestinations(): Promise<void> {
    await this.runRefresh();
  }

  /** Also callable on module init for dev feedback. */
  async runOnStartup(): Promise<void> {
    if (process.env.SEO_FRESHNESS_SYNC_ON_STARTUP === 'true') {
      await this.runRefresh();
    }
  }

  async runRefresh(): Promise<void> {
    const destinations = await this.destinationRepo.find({
      where: { content_status: 'published' },
    });
    const now = new Date();
    for (const dest of destinations) {
      try {
        const intel = await this.intelligence.computeForCity(dest.search_city);
        const listingScore = Math.min(100, (intel.listingCount / 20) * 100);
        const contentScore = dest.hero_image_url ? 80 : 60;
        const reviewScore =
          intel.avgRating != null
            ? Math.min(100, (intel.avgRating / 5) * 100)
            : 40;
        const imageScore = dest.hero_image_url ? 90 : 50;
        const linkScore = dest.nearby_city_slugs?.length ? 70 : 40;
        const seoScore = Math.round(
          listingScore * 0.4 +
            contentScore * 0.3 +
            reviewScore * 0.15 +
            imageScore * 0.1 +
            linkScore * 0.05,
        );
        const indexable =
          dest.content_status === 'published' &&
          intel.listingCount >= MIN_LISTINGS_INDEXABLE &&
          seoScore >= 50;

        await this.destinationRepo.update(dest.id, {
          stats_cache_json: JSON.parse(JSON.stringify(intel)),
          stats_refreshed_at: now,
          listing_count_cache: intel.listingCount,
          seo_score: seoScore,
          indexable,
        });

        await this.registry.syncCityPage(
          dest.id,
          dest.slug,
          indexable,
          seoScore,
          now,
        );
      } catch (err) {
        this.logger.warn(
          `SEO freshness failed for ${dest.slug}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    this.logger.log(`SEO freshness refreshed ${destinations.length} destinations`);
  }
}
