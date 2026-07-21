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

  async syncPageEntry(args: {
    pageType: string;
    slug: string;
    locale: string;
    indexable: boolean;
    seoScore: number;
    lastmod: Date;
  }): Promise<void> {
    await this.registryRepo.update(
      { page_type: args.pageType, slug: args.slug, locale: args.locale },
      {
        indexable: args.indexable,
        seo_score: args.seoScore,
        lastmod: args.lastmod,
      },
    );
  }

  async syncPageAllLocales(args: {
    pageType: string;
    slug: string;
    indexable: boolean;
    seoScore: number;
    lastmod: Date;
  }): Promise<void> {
    for (const locale of ['en', 'fr', 'ar'] as const) {
      await this.syncPageEntry({ ...args, locale });
    }
  }

  /** @deprecated */
  async syncCityPage(
    destinationId: string,
    slug: string,
    indexable: boolean,
    seoScore: number,
    lastmod: Date,
  ): Promise<void> {
    await this.syncPageAllLocales({
      pageType: 'city',
      slug,
      indexable,
      seoScore,
      lastmod,
    });
    void destinationId;
  }
}
