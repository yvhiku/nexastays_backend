import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { SeoPageRegistry } from './entities/seo-page-registry.entity';
import { SeoDestination } from './entities/seo-destination.entity';
import { INDEXABLE_SCORE_THRESHOLD } from './seo-quality-scoring.service';
import type { SeoAdminOverview, SeoAdminPageRow } from './seo.types';

@Injectable()
export class SeoAdminService {
  constructor(
    @InjectRepository(SeoPageRegistry)
    private readonly registryRepo: Repository<SeoPageRegistry>,
    @InjectRepository(SeoDestination)
    private readonly destinationRepo: Repository<SeoDestination>,
  ) {}

  async getOverview(): Promise<SeoAdminOverview> {
    const rows = await this.registryRepo.find();
    const indexed = rows.filter((r) => r.indexable).length;
    const thin = rows.filter(
      (r) => !r.indexable || r.seo_score < INDEXABLE_SCORE_THRESHOLD,
    ).length;
    const avgScore =
      rows.length > 0
        ? Math.round(rows.reduce((s, r) => s + r.seo_score, 0) / rows.length)
        : 0;

    const pageTypeBreakdown: Record<string, number> = {};
    for (const r of rows) {
      pageTypeBreakdown[r.page_type] = (pageTypeBreakdown[r.page_type] ?? 0) + 1;
    }

    const missingHero = await this.destinationRepo.count({
      where: { content_status: 'published', hero_image_url: IsNull() },
    });

    return {
      indexedPages: indexed,
      totalRegistryPages: rows.length,
      sitemapPages: indexed,
      thinContentPages: thin,
      avgSeoScore: avgScore,
      missingHeroImages: missingHero,
      pageTypeBreakdown,
    };
  }

  async listPages(limit = 100): Promise<SeoAdminPageRow[]> {
    const rows = await this.registryRepo.find({
      order: { seo_score: 'ASC', lastmod: 'DESC' },
      take: Math.min(limit, 500),
    });
    return rows.map((r) => ({
      pageType: r.page_type,
      slug: r.slug,
      locale: r.locale,
      path: r.path,
      indexable: r.indexable,
      seoScore: r.seo_score,
      lastmod: r.lastmod.toISOString(),
    }));
  }

  async listThinContent(limit = 50): Promise<SeoAdminPageRow[]> {
    const rows = await this.registryRepo
      .createQueryBuilder('r')
      .where('r.indexable = false OR r.seo_score < :threshold', {
        threshold: INDEXABLE_SCORE_THRESHOLD,
      })
      .orderBy('r.seo_score', 'ASC')
      .take(Math.min(limit, 200))
      .getMany();

    return rows.map((r) => ({
      pageType: r.page_type,
      slug: r.slug,
      locale: r.locale,
      path: r.path,
      indexable: r.indexable,
      seoScore: r.seo_score,
      lastmod: r.lastmod.toISOString(),
    }));
  }
}
