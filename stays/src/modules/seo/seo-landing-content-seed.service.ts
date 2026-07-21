import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeoLandingContent } from './entities/seo-landing-content.entity';
import { SeoNeighborhood } from './entities/seo-neighborhood.entity';
import { SeoDestination } from './entities/seo-destination.entity';
import {
  getMarrakechNeighborhoodContent,
  MARRAKECH_NEIGHBORHOOD_SLUGS,
} from './seo-landing-content.seed-data';
import type { SeoLocale } from './seo.types';

const LOCALES: SeoLocale[] = ['en', 'fr', 'ar'];

@Injectable()
export class SeoLandingContentSeedService implements OnModuleInit {
  private readonly logger = new Logger(SeoLandingContentSeedService.name);

  constructor(
    @InjectRepository(SeoLandingContent)
    private readonly contentRepo: Repository<SeoLandingContent>,
    @InjectRepository(SeoNeighborhood)
    private readonly neighborhoodRepo: Repository<SeoNeighborhood>,
    @InjectRepository(SeoDestination)
    private readonly destinationRepo: Repository<SeoDestination>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seedMarrakechIfEmpty();
    } catch (err) {
      this.logger.warn(`Landing content seed skipped: ${String(err)}`);
    }
  }

  async seedMarrakechIfEmpty(): Promise<void> {
    const existing = await this.contentRepo.count({
      where: { entity_type: 'neighborhood' },
    });
    if (existing > 0) return;

    const dest = await this.destinationRepo.findOne({
      where: { slug: 'marrakech', content_status: 'published' },
    });
    if (!dest) return;

    for (const nbSlug of MARRAKECH_NEIGHBORHOOD_SLUGS) {
      const nb = await this.neighborhoodRepo.findOne({
        where: { destination_id: dest.id, slug: nbSlug, active: true },
      });
      if (!nb) continue;

      for (const locale of LOCALES) {
        const blocks = getMarrakechNeighborhoodContent(nbSlug, locale);
        if (!blocks) continue;
        await this.contentRepo.save(
          this.contentRepo.create({
            entity_type: 'neighborhood',
            entity_id: nb.id,
            locale,
            content_blocks_json: blocks as unknown as Record<string, unknown>,
            content_status: 'published',
          }),
        );
      }
    }

    this.logger.log('Seeded Marrakech neighborhood landing content (en/fr/ar)');
  }
}
