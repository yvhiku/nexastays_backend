import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeoPageRegistry } from './entities/seo-page-registry.entity';
import type { SitemapEntryDto } from './seo.types';

@Injectable()
export class SeoPageRegistryService {
  constructor(
    @InjectRepository(SeoPageRegistry)
    private readonly registryRepo: Repository<SeoPageRegistry>,
  ) {}

  async listIndexableForSitemap(): Promise<SitemapEntryDto[]> {
    const rows = await this.registryRepo.find({
      where: { indexable: true, status: 'published' },
      order: { priority: 'DESC', slug: 'ASC' },
    });
    return rows.map((r) => ({
      path: r.path,
      locale: r.locale,
      lastmod: r.lastmod.toISOString(),
      priority: Number(r.priority),
    }));
  }

  async syncCityPage(
    destinationId: string,
    slug: string,
    indexable: boolean,
    seoScore: number,
    lastmod: Date,
  ): Promise<void> {
    const locales = ['en', 'fr', 'ar'] as const;
    for (const locale of locales) {
      await this.registryRepo.update(
        { page_type: 'city', slug, locale },
        { indexable, seo_score: seoScore, lastmod },
      );
    }
    void destinationId;
  }
}
