import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeoLandingContent } from './entities/seo-landing-content.entity';
import { SeoNeighborhood } from './entities/seo-neighborhood.entity';
import type { SeoLandingContentBlocks } from './seo-landing-content.types';
import type { SeoLocale } from './seo.types';

@Injectable()
export class SeoLandingContentService {
  constructor(
    @InjectRepository(SeoLandingContent)
    private readonly contentRepo: Repository<SeoLandingContent>,
    @InjectRepository(SeoNeighborhood)
    private readonly neighborhoodRepo: Repository<SeoNeighborhood>,
  ) {}

  async loadPublishedBlocks(
    entityType: string,
    entityId: string,
    locale: SeoLocale,
  ): Promise<SeoLandingContentBlocks | null> {
    const row = await this.contentRepo.findOne({
      where: {
        entity_type: entityType,
        entity_id: entityId,
        locale,
        content_status: 'published',
      },
    });
    if (!row?.content_blocks_json) return null;
    return row.content_blocks_json as SeoLandingContentBlocks;
  }

  async findNeighborhoodId(
    citySlug: string,
    neighborhoodSlug: string,
  ): Promise<SeoNeighborhood | null> {
    return this.neighborhoodRepo
      .createQueryBuilder('n')
      .innerJoin('n.destination', 'd')
      .where('d.slug = :citySlug', { citySlug })
      .andWhere('n.slug = :neighborhoodSlug', { neighborhoodSlug })
      .andWhere('n.active = true')
      .getOne();
  }
}
