import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SeoDestination } from './entities/seo-destination.entity';
import { SeoPageRegistry } from './entities/seo-page-registry.entity';
import { DestinationIntelligenceService } from './destination-intelligence.service';
import {
  SEO_AMENITIES,
  SEO_PROPERTY_TYPES,
  amenityBySlug,
  amenityToExploreFilters,
  propertyTypeBySlug,
  resolveSeoSegments,
  type ResolvedSeoPage,
  type SeoExploreFilters,
} from './seo-catalog';
import { computeSeoQualityScore, isPageIndexable } from './seo-quality-scoring.service';
import type {
  AiContextPayload,
  AiSnippet,
  GeoBlockDto,
  SeoDestinationDto,
  SeoExploreFiltersDto,
  SeoLocale,
  SeoPagePayload,
  SeoPageType,
} from './seo.types';

const LOCALES: SeoLocale[] = ['en', 'fr', 'ar'];

@Injectable()
export class SeoEngineService {
  constructor(
    @InjectRepository(SeoDestination)
    private readonly destinationRepo: Repository<SeoDestination>,
    @InjectRepository(SeoPageRegistry)
    private readonly registryRepo: Repository<SeoPageRegistry>,
    private readonly intelligence: DestinationIntelligenceService,
  ) {}

  async listDestinations(): Promise<SeoDestinationDto[]> {
    const rows = await this.destinationRepo.find({
      where: { content_status: 'published' },
      order: { name: 'ASC' },
    });
    return rows.map((d) => this.toDestinationDto(d));
  }

  async getDestinationBySlug(slug: string): Promise<SeoDestination> {
    const dest = await this.destinationRepo.findOne({ where: { slug } });
    if (!dest || dest.content_status !== 'published') {
      throw new NotFoundException('Destination not found');
    }
    return dest;
  }

  async generateCityPage(slug: string, locale: SeoLocale): Promise<SeoPagePayload> {
    return this.resolveAndGenerate([slug], locale);
  }

  async resolveAndGenerate(
    segments: string[],
    locale: SeoLocale,
  ): Promise<SeoPagePayload> {
    const resolved = resolveSeoSegments(segments);
    if (!resolved) throw new NotFoundException('Page not found');
    return this.generateResolved(resolved, locale);
  }

  async generateResolved(
    resolved: ResolvedSeoPage,
    locale: SeoLocale,
  ): Promise<SeoPagePayload> {
    switch (resolved.kind) {
      case 'city':
        return this.buildCityPage(resolved.citySlug, locale);
      case 'property_type':
        return this.buildGlobalPropertyType(resolved.typeSlug, locale);
      case 'amenity':
        return this.buildGlobalAmenity(resolved.amenitySlug, locale);
      case 'city_property_type':
        return this.buildCityPropertyType(
          resolved.citySlug,
          resolved.typeSlug,
          locale,
        );
      case 'city_amenity':
        return this.buildCityAmenity(
          resolved.citySlug,
          resolved.amenitySlug,
          locale,
        );
      default:
        throw new NotFoundException('Page not found');
    }
  }

  async buildAiContextForPath(
    segments: string[],
    locale: SeoLocale,
    siteUrl: string,
  ): Promise<AiContextPayload> {
    const page = await this.resolveAndGenerate(segments, locale);
    const geoBlocks = page.geoBlocks;
    const summary =
      page.intelligence.listingCount > 0
        ? `${page.h1}: ${page.intelligence.listingCount} verified stays on Nexa Stays` +
          (page.intelligence.avgNightlyPrice != null
            ? `, average ${page.intelligence.avgNightlyPrice} ${page.intelligence.currency}/night.`
            : '.')
        : `${page.h1} on Nexa Stays — verified stays in Morocco.`;

    return {
      pageType: page.pageType,
      destination: page.destination?.name ?? null,
      country: 'Morocco',
      summary,
      listingCount: page.intelligence.listingCount,
      verifiedCount: page.intelligence.verifiedCount,
      averagePrice: page.intelligence.avgNightlyPrice,
      minPrice: page.intelligence.minPrice,
      currency: page.intelligence.currency,
      averageRating: page.intelligence.avgRating,
      bestArea: page.intelligence.topNeighborhood,
      familyArea: page.destination
        ? this.areaHint(page.destination.slug, 'family')
        : null,
      nightlifeArea: page.destination
        ? this.areaHint(page.destination.slug, 'nightlife')
        : null,
      couplesArea: page.destination
        ? this.areaHint(page.destination.slug, 'couples')
        : null,
      nomadArea: page.destination
        ? this.areaHint(page.destination.slug, 'nomads')
        : null,
      topAmenities: page.intelligence.topAmenities,
      bestMonth: page.destination?.bestTimeToVisit?.split(';')[0]?.trim() ?? null,
      safety: geoBlocks.find((b) => b.question.toLowerCase().includes('safe'))?.answer ?? null,
      transport: null,
      snippets: page.aiSnippets,
      canonicalUrl: `${siteUrl.replace(/\/$/, '')}${page.canonical}`,
      lastUpdated: page.lastmod,
    };
  }

  /** @deprecated use buildAiContextForPath */
  async buildAiContext(
    slug: string,
    locale: SeoLocale,
    siteUrl: string,
  ): Promise<AiContextPayload> {
    return this.buildAiContextForPath([slug], locale, siteUrl);
  }

  private async buildCityPage(
    citySlug: string,
    locale: SeoLocale,
  ): Promise<SeoPagePayload> {
    const dest = await this.getDestinationBySlug(citySlug);
    const exploreFilters: SeoExploreFilters = { city: dest.search_city };
    return this.assemblePage({
      pageType: 'city',
      locale,
      registrySlug: dest.slug,
      pathSuffix: dest.slug,
      dest,
      filterLabel: null,
      exploreFilters,
      title: `Stays in ${dest.name} | Hotels, Riads & Apartments | Nexa Stays`,
      description: `Discover hotels, riads, apartments and villas in ${dest.name}. Compare verified listings and book securely with Nexa Stays.`,
      h1: `Stays in ${dest.name}`,
      breadcrumbs: (p) => [
        { name: 'Home', path: `/${locale}` },
        { name: 'Stays', path: `/${locale}/stays` },
        { name: dest.name, path: p },
      ],
    });
  }

  private async buildGlobalPropertyType(
    typeSlug: string,
    locale: SeoLocale,
  ): Promise<SeoPagePayload> {
    const pt = propertyTypeBySlug(typeSlug);
    if (!pt) throw new NotFoundException('Property type not found');
    const exploreFilters: SeoExploreFilters = {
      listing_type: pt.listingType,
    };
    return this.assemblePage({
      pageType: 'property_type',
      locale,
      registrySlug: pt.slug,
      pathSuffix: pt.slug,
      dest: null,
      filterLabel: pt.pluralLabel,
      exploreFilters,
      title: `${pt.pluralLabel} in Morocco | Nexa Stays`,
      description: `Browse verified ${pt.pluralLabel.toLowerCase()} across Morocco. Transparent fees and identity-checked hosts on Nexa Stays.`,
      h1: `${pt.pluralLabel} in Morocco`,
      breadcrumbs: (p) => [
        { name: 'Home', path: `/${locale}` },
        { name: 'Stays', path: `/${locale}/stays` },
        { name: pt.pluralLabel, path: p },
      ],
    });
  }

  private async buildGlobalAmenity(
    amenitySlug: string,
    locale: SeoLocale,
  ): Promise<SeoPagePayload> {
    const am = amenityBySlug(amenitySlug);
    if (!am) throw new NotFoundException('Amenity not found');
    const exploreFilters: SeoExploreFilters = amenityToExploreFilters(am);
    return this.assemblePage({
      pageType: 'amenity',
      locale,
      registrySlug: am.slug,
      pathSuffix: am.slug,
      dest: null,
      filterLabel: am.label,
      exploreFilters,
      title: `${am.label} Stays in Morocco | Nexa Stays`,
      description: `Find ${am.label.toLowerCase()} stays across Morocco on Nexa Stays. Verified listings with clear pricing.`,
      h1: `${am.label} stays in Morocco`,
      breadcrumbs: (p) => [
        { name: 'Home', path: `/${locale}` },
        { name: 'Stays', path: `/${locale}/stays` },
        { name: am.label, path: p },
      ],
    });
  }

  private async buildCityPropertyType(
    citySlug: string,
    typeSlug: string,
    locale: SeoLocale,
  ): Promise<SeoPagePayload> {
    const dest = await this.getDestinationBySlug(citySlug);
    const pt = propertyTypeBySlug(typeSlug);
    if (!pt) throw new NotFoundException('Property type not found');
    const exploreFilters: SeoExploreFilters = {
      city: dest.search_city,
      listing_type: pt.listingType,
    };
    return this.assemblePage({
      pageType: 'city_property_type',
      locale,
      registrySlug: `${dest.slug}/${pt.slug}`,
      pathSuffix: `${dest.slug}/${pt.slug}`,
      dest,
      filterLabel: pt.pluralLabel,
      exploreFilters,
      title: `${pt.pluralLabel} in ${dest.name} | Nexa Stays`,
      description: `Browse ${pt.pluralLabel.toLowerCase()} in ${dest.name}. Verified listings on Nexa Stays.`,
      h1: `${pt.pluralLabel} in ${dest.name}`,
      breadcrumbs: (p) => [
        { name: 'Home', path: `/${locale}` },
        { name: 'Stays', path: `/${locale}/stays` },
        { name: dest.name, path: `/${locale}/stays/${dest.slug}` },
        { name: pt.pluralLabel, path: p },
      ],
    });
  }

  private async buildCityAmenity(
    citySlug: string,
    amenitySlug: string,
    locale: SeoLocale,
  ): Promise<SeoPagePayload> {
    const dest = await this.getDestinationBySlug(citySlug);
    const am = amenityBySlug(amenitySlug);
    if (!am) throw new NotFoundException('Amenity not found');
    const exploreFilters: SeoExploreFilters = {
      city: dest.search_city,
      ...amenityToExploreFilters(am),
    };
    return this.assemblePage({
      pageType: 'city_amenity',
      locale,
      registrySlug: `${dest.slug}/${am.slug}`,
      pathSuffix: `${dest.slug}/${am.slug}`,
      dest,
      filterLabel: am.label,
      exploreFilters,
      title: `${am.label} Stays in ${dest.name} | Nexa Stays`,
      description: `Find ${am.label.toLowerCase()} stays in ${dest.name} on Nexa Stays.`,
      h1: `${am.label} stays in ${dest.name}`,
      breadcrumbs: (p) => [
        { name: 'Home', path: `/${locale}` },
        { name: 'Stays', path: `/${locale}/stays` },
        { name: dest.name, path: `/${locale}/stays/${dest.slug}` },
        { name: am.label, path: p },
      ],
    });
  }

  private async assemblePage(args: {
    pageType: SeoPageType;
    locale: SeoLocale;
    registrySlug: string;
    pathSuffix: string;
    dest: SeoDestination | null;
    filterLabel: string | null;
    exploreFilters: SeoExploreFilters;
    title: string;
    description: string;
    h1: string;
    breadcrumbs: (path: string) => { name: string; path: string }[];
  }): Promise<SeoPagePayload> {
    const path = `/${args.locale}/stays/${args.pathSuffix}`;
    const intel = await this.intelligence.compute(args.exploreFilters);
    const seoScore = computeSeoQualityScore({
      intelligence: intel,
      destination: args.dest,
    });
    const registryRow = await this.registryRepo.findOne({
      where: {
        page_type: args.pageType,
        slug: args.registrySlug,
        locale: args.locale,
      },
    });
    const indexable =
      registryRow?.indexable ??
      isPageIndexable({ seoScore, listingCount: intel.listingCount });

    const destDto = args.dest ? this.toDestinationDto(args.dest) : null;
    const nearby = args.dest
      ? await this.loadNearby(args.dest.nearby_city_slugs ?? [])
      : [];

    const geoBlocks = this.buildGeoBlocks(args.h1, args.dest, intel);
    const aiSnippets = this.buildAiSnippets(args.h1, intel);

    const priceSuffix =
      intel.avgNightlyPrice != null
        ? ` From ${intel.avgNightlyPrice} ${intel.currency}/night.`
        : '';
    const description = `${args.description}${priceSuffix}`;

    return {
      pageType: args.pageType,
      locale: args.locale,
      path,
      title: args.title,
      description,
      h1: args.h1,
      canonical: path,
      hreflang: Object.fromEntries(
        LOCALES.map((loc) => [loc, `/${loc}/stays/${args.pathSuffix}`]),
      ),
      robots: indexable ? 'index,follow' : 'noindex,follow',
      destination: destDto,
      filterLabel: args.filterLabel,
      exploreFilters: args.exploreFilters as SeoExploreFiltersDto,
      intelligence: intel,
      geoBlocks,
      faq: geoBlocks,
      aiSnippets,
      nearbyDestinations: nearby,
      propertyTypeLinks: destDto
        ? SEO_PROPERTY_TYPES.map((pt) => ({
            slug: pt.slug,
            label: `${pt.pluralLabel} in ${destDto.name}`,
            href: `/${args.locale}/stays/${destDto.slug}/${pt.slug}`,
          }))
        : [],
      amenityLinks: destDto
        ? SEO_AMENITIES.map((am) => ({
            slug: am.slug,
            label: `${am.label} in ${destDto.name}`,
            href: `/${args.locale}/stays/${destDto.slug}/${am.slug}`,
          }))
        : [],
      breadcrumbs: args.breadcrumbs(path),
      indexable,
      seoScore: registryRow?.seo_score ?? seoScore,
      lastmod: registryRow?.lastmod?.toISOString() ?? new Date().toISOString(),
      registrySlug: args.registrySlug,
    };
  }

  private buildGeoBlocks(
    h1: string,
    dest: SeoDestination | null,
    intel: SeoPagePayload['intelligence'],
  ): GeoBlockDto[] {
    const blocks: GeoBlockDto[] = [];
    if (intel.avgNightlyPrice != null) {
      blocks.push({
        question: `Average price for ${h1}?`,
        answer: `Around ${intel.avgNightlyPrice} ${intel.currency}/night based on live Nexa Stays listings.`,
        statKey: 'avgNightlyPrice',
      });
    }
    if (intel.listingCount > 0) {
      blocks.push({
        question: `How many listings match ${h1}?`,
        answer: `${intel.listingCount} live listings (${intel.verifiedCount} with verified walkthrough).`,
        statKey: 'listingCount',
      });
    }
    if (dest) {
      blocks.push({
        question: `Is ${dest.name} safe for tourists?`,
        answer: `Yes. Popular tourist districts in ${dest.name} are generally safe when using verified stays.`,
      });
      if (dest.best_time_to_visit) {
        blocks.push({
          question: `Best time to visit ${dest.name}?`,
          answer: dest.best_time_to_visit,
        });
      }
    }
    return blocks;
  }

  private buildAiSnippets(label: string, intel: SeoPagePayload['intelligence']): AiSnippet[] {
    const snippets: AiSnippet[] = [];
    if (intel.listingCount > 0) {
      snippets.push({
        type: 'summary',
        content: `${label}: ${intel.listingCount} verified stays on Nexa Stays.`,
        confidence: 1,
        source: 'marketplace',
      });
    }
    if (intel.avgNightlyPrice != null) {
      snippets.push({
        type: 'price',
        content: `Average nightly price is about ${intel.avgNightlyPrice} ${intel.currency}.`,
        confidence: 1,
        source: 'marketplace',
      });
    }
    return snippets;
  }

  private areaHint(
    slug: string,
    kind: 'family' | 'nightlife' | 'couples' | 'nomads',
  ): string | null {
    const hints: Record<string, Partial<Record<typeof kind, string>>> = {
      marrakech: { family: 'Palmeraie', nightlife: 'Gueliz', couples: 'Hivernage', nomads: 'Gueliz' },
      casablanca: { family: 'Anfa', nightlife: 'Maarif', couples: 'Ain Diab', nomads: 'Maarif' },
      agadir: { family: 'Founty', nightlife: 'Marina', couples: 'Talborjt', nomads: 'Marina' },
      rabat: { family: 'Agdal', nightlife: 'Agdal', couples: 'Hassan', nomads: 'Agdal' },
      fes: { family: 'Zouagha', nightlife: 'Ville Nouvelle', couples: 'Medina', nomads: 'Ville Nouvelle' },
      tangier: { family: 'Malabata', nightlife: 'City Center', couples: 'Kasbah', nomads: 'City Center' },
    };
    return hints[slug]?.[kind] ?? null;
  }

  private async loadNearby(slugs: string[]): Promise<SeoDestinationDto[]> {
    if (!slugs.length) return [];
    const rows = await this.destinationRepo.find({
      where: { slug: In(slugs), content_status: 'published' },
    });
    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    return slugs.map((s) => bySlug.get(s)).filter(Boolean).map((d) => this.toDestinationDto(d!));
  }

  private toDestinationDto(d: SeoDestination): SeoDestinationDto {
    return {
      id: d.id,
      slug: d.slug,
      name: d.name,
      countryCode: d.country_code,
      regionId: d.region_id,
      latitude: d.latitude != null ? Number(d.latitude) : null,
      longitude: d.longitude != null ? Number(d.longitude) : null,
      heroImageUrl: d.hero_image_url,
      bestTimeToVisit: d.best_time_to_visit,
      nearbyCitySlugs: d.nearby_city_slugs ?? [],
      searchCity: d.search_city,
      indexable: d.indexable,
      seoScore: d.seo_score,
      listingCountCache: d.listing_count_cache,
    };
  }
}
