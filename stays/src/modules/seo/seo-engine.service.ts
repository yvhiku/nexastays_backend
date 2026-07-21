import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SeoDestination } from './entities/seo-destination.entity';
import { DestinationIntelligenceService } from './destination-intelligence.service';
import type {
  AiContextPayload,
  AiSnippet,
  GeoBlockDto,
  SeoDestinationDto,
  SeoLocale,
  SeoPagePayload,
} from './seo.types';

const LOCALES: SeoLocale[] = ['en', 'fr', 'ar'];
const PROPERTY_TYPES = [
  { slug: 'riads', label: 'Riads' },
  { slug: 'apartments', label: 'Apartments' },
  { slug: 'villas', label: 'Villas' },
  { slug: 'hotels', label: 'Hotels' },
  { slug: 'hostels', label: 'Hostels' },
];

@Injectable()
export class SeoEngineService {
  constructor(
    @InjectRepository(SeoDestination)
    private readonly destinationRepo: Repository<SeoDestination>,
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
    const dest = await this.getDestinationBySlug(slug);
    const intelligence =
      (dest.stats_cache_json as unknown as SeoPagePayload['intelligence']) ??
      (await this.intelligence.computeForCity(dest.search_city));

    const nearby = await this.loadNearby(dest.nearby_city_slugs ?? []);
    const geoBlocks = this.buildGeoBlocks(dest, intelligence);
    const aiSnippets = this.buildAiSnippets(dest, intelligence);
    const path = `/${locale}/stays/${dest.slug}`;
    const title = `Stays in ${dest.name} | Hotels, Riads & Apartments | Nexa Stays`;
    const description = this.buildDescription(dest, intelligence);

    return {
      pageType: 'city',
      locale,
      path,
      title,
      description,
      h1: `Stays in ${dest.name}`,
      canonical: path,
      hreflang: Object.fromEntries(
        LOCALES.map((loc) => [loc, `/${loc}/stays/${dest.slug}`]),
      ),
      robots: dest.indexable ? 'index,follow' : 'noindex,follow',
      destination: this.toDestinationDto(dest),
      intelligence,
      geoBlocks,
      faq: geoBlocks,
      aiSnippets,
      nearbyDestinations: nearby,
      propertyTypeLinks: PROPERTY_TYPES.map((pt) => ({
        slug: pt.slug,
        label: `${pt.label} in ${dest.name}`,
        href: `/${locale}/stays/${dest.slug}/${pt.slug}`,
      })),
      breadcrumbs: [
        { name: 'Home', path: `/${locale}` },
        { name: 'Stays', path: `/${locale}/stays` },
        { name: dest.name, path },
      ],
      indexable: dest.indexable,
      seoScore: dest.seo_score,
      lastmod: (dest.stats_refreshed_at ?? dest.updated_at).toISOString(),
    };
  }

  async buildAiContext(slug: string, locale: SeoLocale, siteUrl: string): Promise<AiContextPayload> {
    const dest = await this.getDestinationBySlug(slug);
    const intelligence =
      (dest.stats_cache_json as unknown as SeoPagePayload['intelligence']) ??
      (await this.intelligence.computeForCity(dest.search_city));
    const snippets = this.buildAiSnippets(dest, intelligence);
    const geoBlocks = this.buildGeoBlocks(dest, intelligence);
    const canonicalUrl = `${siteUrl.replace(/\/$/, '')}/${locale}/stays/${dest.slug}`;

    const summary =
      intelligence.listingCount > 0
        ? `${dest.name} offers ${intelligence.listingCount} verified stays` +
          (intelligence.avgNightlyPrice != null
            ? ` with an average nightly price of ${intelligence.avgNightlyPrice} ${intelligence.currency}.`
            : '.')
        : `${dest.name} is a popular destination for verified stays in Morocco on Nexa Stays.`;

    return {
      destination: dest.name,
      country: 'Morocco',
      summary,
      listingCount: intelligence.listingCount,
      verifiedCount: intelligence.verifiedCount,
      averagePrice: intelligence.avgNightlyPrice,
      minPrice: intelligence.minPrice,
      currency: intelligence.currency,
      averageRating: intelligence.avgRating,
      bestArea: intelligence.topNeighborhood,
      familyArea: this.areaHint(dest.slug, 'family'),
      nightlifeArea: this.areaHint(dest.slug, 'nightlife'),
      couplesArea: this.areaHint(dest.slug, 'couples'),
      nomadArea: this.areaHint(dest.slug, 'nomads'),
      topAmenities: intelligence.topAmenities,
      bestMonth: dest.best_time_to_visit?.split(';')[0]?.trim() ?? null,
      safety: geoBlocks.find((b) => b.question.toLowerCase().includes('safe'))?.answer ?? null,
      transport: null,
      snippets,
      canonicalUrl,
      lastUpdated: (dest.stats_refreshed_at ?? dest.updated_at).toISOString(),
    };
  }

  private buildDescription(
    dest: SeoDestination,
    intel: SeoPagePayload['intelligence'],
  ): string {
    const price =
      intel.avgNightlyPrice != null
        ? ` Average from ${intel.avgNightlyPrice} ${intel.currency}/night.`
        : '';
    return `Discover hotels, riads, apartments and villas in ${dest.name}. Compare verified listings and book securely with Nexa Stays.${price}`;
  }

  private buildGeoBlocks(
    dest: SeoDestination,
    intel: SeoPagePayload['intelligence'],
  ): GeoBlockDto[] {
    const stored = (dest.geo_blocks_json ?? []) as GeoBlockDto[];
    if (stored.length > 0) return stored;

    const blocks: GeoBlockDto[] = [];
    if (intel.avgNightlyPrice != null) {
      blocks.push({
        question: `Average stay price in ${dest.name}?`,
        answer: `Around ${intel.avgNightlyPrice} ${intel.currency}/night based on live Nexa Stays listings.`,
        statKey: 'avgNightlyPrice',
      });
    }
    if (intel.listingCount > 0) {
      blocks.push({
        question: `How many verified stays in ${dest.name}?`,
        answer: `${intel.listingCount} live listings (${intel.verifiedCount} with verified walkthrough).`,
        statKey: 'listingCount',
      });
    }
    blocks.push({
      question: `Is ${dest.name} safe for tourists?`,
      answer: `Yes. Popular tourist districts in ${dest.name} are generally safe when using verified stays and standard travel precautions.`,
    });
    const family = this.areaHint(dest.slug, 'family');
    if (family) {
      blocks.push({
        question: `Best area for families in ${dest.name}?`,
        answer: family,
      });
    }
    const nightlife = this.areaHint(dest.slug, 'nightlife');
    if (nightlife) {
      blocks.push({
        question: `Best area for nightlife in ${dest.name}?`,
        answer: nightlife,
      });
    }
    if (dest.best_time_to_visit) {
      blocks.push({
        question: `Best time to visit ${dest.name}?`,
        answer: dest.best_time_to_visit,
      });
    }
    return blocks;
  }

  private buildAiSnippets(
    dest: SeoDestination,
    intel: SeoPagePayload['intelligence'],
  ): AiSnippet[] {
    const snippets: AiSnippet[] = [];
    if (intel.listingCount > 0) {
      snippets.push({
        type: 'summary',
        content: `${dest.name} has ${intel.listingCount} verified stays on Nexa Stays.`,
        confidence: 1,
        source: 'marketplace',
      });
    }
    if (intel.avgNightlyPrice != null) {
      snippets.push({
        type: 'price',
        content: `Average nightly price in ${dest.name} is about ${intel.avgNightlyPrice} ${intel.currency}.`,
        confidence: 1,
        source: 'marketplace',
      });
    }
    if (intel.topNeighborhood) {
      snippets.push({
        type: 'nomads',
        content: `${intel.topNeighborhood} is among the most booked areas in ${dest.name}.`,
        confidence: 0.95,
        source: 'marketplace',
      });
    }
    if (dest.best_time_to_visit) {
      snippets.push({
        type: 'seasonality',
        content: `Best time to visit ${dest.name}: ${dest.best_time_to_visit}.`,
        confidence: 0.9,
        source: 'editorial',
      });
    }
    snippets.push({
      type: 'safety',
      content: `Tourist areas in ${dest.name} are generally safe; book verified stays on Nexa Stays for clearer host information.`,
      confidence: 0.85,
      source: 'editorial',
    });
    return snippets;
  }

  private areaHint(
    slug: string,
    kind: 'family' | 'nightlife' | 'couples' | 'nomads',
  ): string | null {
    const hints: Record<string, Partial<Record<typeof kind, string>>> = {
      marrakech: {
        family: 'Palmeraie',
        nightlife: 'Gueliz',
        couples: 'Hivernage',
        nomads: 'Gueliz',
      },
      casablanca: {
        family: 'Anfa',
        nightlife: 'Maarif',
        couples: 'Ain Diab',
        nomads: 'Maarif',
      },
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
