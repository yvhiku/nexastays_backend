import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { SeoGuide } from './entities/seo-guide.entity';
import { SeoDestination } from './entities/seo-destination.entity';
import { DestinationIntelligenceService } from './destination-intelligence.service';
import type {
  AiContextPayload,
  GeoBlockDto,
  SeoDestinationDto,
  SeoGuidePagePayload,
  SeoGuideSummaryDto,
  SeoGuideType,
  SeoLocale,
  DestinationIntelligence,
} from './seo.types';

const LOCALES: SeoLocale[] = ['en', 'fr', 'ar'];

@Injectable()
export class SeoGuideService {
  constructor(
    @InjectRepository(SeoGuide)
    private readonly guideRepo: Repository<SeoGuide>,
    @InjectRepository(SeoDestination)
    private readonly destinationRepo: Repository<SeoDestination>,
    private readonly intelligence: DestinationIntelligenceService,
  ) {}

  async listGuides(
    locale: SeoLocale,
    guideType?: SeoGuideType,
  ): Promise<SeoGuideSummaryDto[]> {
    const where: Record<string, unknown> = {
      locale,
      content_status: 'published',
    };
    if (guideType) where.guide_type = guideType;

    const rows = await this.guideRepo.find({
      where,
      relations: ['destination'],
      order: { seo_score: 'DESC', slug: 'ASC' },
    });

    return rows.map((g) => this.toSummary(g, locale));
  }

  async getGuidePage(slug: string, locale: SeoLocale): Promise<SeoGuidePagePayload> {
    const guide = await this.guideRepo.findOne({
      where: { slug, locale, content_status: 'published' },
      relations: ['destination'],
    });
    if (!guide) throw new NotFoundException('Guide not found');

    const dest = guide.destination;
    const destDto = dest ? this.toDestinationDto(dest) : null;

    let intel: DestinationIntelligence | null = null;
    if (dest) {
      intel = await this.intelligence.compute({ city: dest.search_city });
    }

    const geoBlocks = this.parseGeoBlocks(guide.geo_blocks_json, intel);
    const path = `/${locale}/guides/${guide.slug}`;
    const indexable = guide.indexable && guide.seo_score >= 75;

    const relatedGuides = await this.loadRelatedGuides(guide, locale);
    const cityGuideLink =
      dest && guide.guide_type !== 'travel'
        ? {
            slug: `${dest.slug}-travel-guide`,
            href: `/${locale}/guides/${dest.slug}-travel-guide`,
            label: `${dest.name} travel guide`,
          }
        : null;

    const h1 = guide.seo_title?.replace(/\s*\|\s*Nexa Stays$/i, '') ?? guide.slug;

    return {
      pageType: 'guide',
      locale,
      slug: guide.slug,
      guideType: guide.guide_type,
      path,
      title: guide.seo_title ?? h1,
      description: guide.seo_description ?? '',
      h1,
      canonical: path,
      hreflang: Object.fromEntries(
        LOCALES.map((loc) => [loc, `/${loc}/guides/${guide.slug}`]),
      ),
      robots: indexable ? 'index,follow' : 'noindex,follow',
      bodyHtml: guide.body_html ?? '',
      geoBlocks,
      destination: destDto,
      intelligence: intel,
      relatedGuides,
      cityGuideLink,
      exploreFilters: dest ? { city: dest.search_city } : {},
      breadcrumbs: [
        { name: 'Home', path: `/${locale}` },
        { name: 'Guides', path: `/${locale}/guides` },
        { name: h1, path },
      ],
      indexable,
      seoScore: guide.seo_score,
      lastmod: (guide.updated_at ?? guide.published_at ?? new Date()).toISOString(),
    };
  }

  async buildAiContext(
    slug: string,
    locale: SeoLocale,
    siteUrl: string,
  ): Promise<AiContextPayload> {
    const page = await this.getGuidePage(slug, locale);
    const intel = page.intelligence;
    const summary =
      intel && intel.listingCount > 0
        ? `${page.h1}: ${intel.listingCount} verified stays on Nexa Stays` +
          (intel.avgNightlyPrice != null
            ? `, average ${intel.avgNightlyPrice} ${intel.currency}/night.`
            : '.')
        : `${page.h1} — travel guide on Nexa Stays for Morocco.`;

    return {
      pageType: 'guide',
      destination: page.destination?.name ?? null,
      country: 'Morocco',
      summary,
      listingCount: intel?.listingCount ?? 0,
      verifiedCount: intel?.verifiedCount ?? 0,
      averagePrice: intel?.avgNightlyPrice ?? null,
      minPrice: intel?.minPrice ?? null,
      currency: intel?.currency ?? 'MAD',
      averageRating: intel?.avgRating ?? null,
      bestArea: intel?.topNeighborhood ?? null,
      familyArea: null,
      nightlifeArea: null,
      couplesArea: null,
      nomadArea: null,
      topAmenities: intel?.topAmenities ?? [],
      bestMonth: page.destination?.bestTimeToVisit?.split(';')[0]?.trim() ?? null,
      safety: page.geoBlocks.find((b) => b.question.toLowerCase().includes('safe'))?.answer ?? null,
      transport: null,
      snippets: [],
      canonicalUrl: `${siteUrl.replace(/\/$/, '')}${page.canonical}`,
      lastUpdated: page.lastmod,
    };
  }

  private async loadRelatedGuides(
    guide: SeoGuide,
    locale: SeoLocale,
  ): Promise<SeoGuideSummaryDto[]> {
    if (guide.destination_id) {
      const siblings = await this.guideRepo.find({
        where: {
          destination_id: guide.destination_id,
          locale,
          content_status: 'published',
        },
        relations: ['destination'],
        order: { guide_type: 'ASC' },
        take: 6,
      });
      return siblings
        .filter((g) => g.id !== guide.id)
        .map((g) => this.toSummary(g, locale));
    }

    const countryGuides = await this.guideRepo.find({
      where: { destination_id: IsNull(), locale, content_status: 'published' },
      take: 4,
    });
    return countryGuides
      .filter((g) => g.id !== guide.id)
      .map((g) => this.toSummary(g, locale));
  }

  private toSummary(guide: SeoGuide, locale: SeoLocale): SeoGuideSummaryDto {
    return {
      slug: guide.slug,
      guideType: guide.guide_type,
      title: guide.seo_title?.replace(/\s*\|\s*Nexa Stays$/i, '') ?? guide.slug,
      description: guide.seo_description ?? '',
      destinationSlug: guide.destination?.slug ?? null,
      destinationName: guide.destination?.name ?? null,
      href: `/${locale}/guides/${guide.slug}`,
      seoScore: guide.seo_score,
    };
  }

  private parseGeoBlocks(
    raw: unknown,
    intel: Awaited<ReturnType<DestinationIntelligenceService['compute']>> | null,
  ): GeoBlockDto[] {
    const blocks: GeoBlockDto[] = [];
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (
          item &&
          typeof item === 'object' &&
          'question' in item &&
          'answer' in item
        ) {
          blocks.push({
            question: String((item as GeoBlockDto).question),
            answer: String((item as GeoBlockDto).answer),
            statKey: (item as GeoBlockDto).statKey ?? null,
          });
        }
      }
    }
    if (intel && intel.listingCount > 0) {
      const liveBlock = blocks.find((b) =>
        b.question.toLowerCase().includes('how many'),
      );
      if (liveBlock) {
        liveBlock.answer = `${intel.listingCount} live listings on Nexa Stays (${intel.verifiedCount} verified).`;
      }
    }
    return blocks;
  }

  private toDestinationDto(dest: SeoDestination): SeoDestinationDto {
    return {
      id: dest.id,
      slug: dest.slug,
      name: dest.name,
      countryCode: dest.country_code,
      regionId: dest.region_id,
      latitude: dest.latitude != null ? Number(dest.latitude) : null,
      longitude: dest.longitude != null ? Number(dest.longitude) : null,
      heroImageUrl: dest.hero_image_url,
      bestTimeToVisit: dest.best_time_to_visit,
      nearbyCitySlugs: dest.nearby_city_slugs ?? [],
      searchCity: dest.search_city,
      indexable: dest.indexable,
      seoScore: dest.seo_score,
      listingCountCache: dest.listing_count_cache,
    };
  }
}
