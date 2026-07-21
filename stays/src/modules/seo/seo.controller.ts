import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_DEFAULT } from '../../common/abuse/throttle-presets';
import { SeoEngineService } from './seo-engine.service';
import { SeoPageRegistryService } from './seo-page-registry.service';
import type { SeoLocale } from './seo.types';

function parseLocale(locale?: string): SeoLocale {
  return locale === 'fr' || locale === 'ar' ? locale : 'en';
}

function parsePathSegments(path?: string): string[] {
  if (!path?.trim()) return [];
  return path
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);
}

@ApiTags('SEO')
@Controller('stays/seo')
export class SeoController {
  constructor(
    private readonly engine: SeoEngineService,
    private readonly registry: SeoPageRegistryService,
  ) {}

  @Public()
  @Get('destinations')
  @ApiOperation({ summary: 'List published SEO destinations' })
  listDestinations() {
    return this.engine.listDestinations();
  }

  @Public()
  @Get('destinations/:slug')
  @ApiOperation({ summary: 'Get destination record by slug' })
  async getDestination(@Param('slug') slug: string) {
    const dest = await this.engine.getDestinationBySlug(slug);
    return {
      id: dest.id,
      slug: dest.slug,
      name: dest.name,
      searchCity: dest.search_city,
      heroImageUrl: dest.hero_image_url,
      indexable: dest.indexable,
      listingCountCache: dest.listing_count_cache,
    };
  }

  @Public()
  @Get('pages/resolve')
  @ApiOperation({ summary: 'Resolve SEO page by path segments (e.g. marrakech/riads)' })
  resolvePage(
    @Query('path') path: string,
    @Query('locale') locale?: string,
  ) {
    const segments = parsePathSegments(path);
    return this.engine.resolveAndGenerate(segments, parseLocale(locale));
  }

  @Public()
  @Get('pages/city/:slug')
  @ApiOperation({ summary: 'Full SEO page payload for a city landing page (legacy)' })
  generateCityPage(
    @Param('slug') slug: string,
    @Query('locale') locale?: string,
  ) {
    return this.engine.generateCityPage(slug, parseLocale(locale));
  }

  @Public()
  @Get('pages/:segment/:combo')
  @ApiOperation({ summary: 'City × filter combo SEO page (e.g. marrakech/riads)' })
  generateComboPage(
    @Param('segment') segment: string,
    @Param('combo') combo: string,
    @Query('locale') locale?: string,
  ) {
    return this.engine.resolveAndGenerate([segment, combo], parseLocale(locale));
  }

  @Public()
  @Get('pages/:segment')
  @ApiOperation({ summary: 'Single-segment SEO page (city, property type, or amenity)' })
  generateSegmentPage(
    @Param('segment') segment: string,
    @Query('locale') locale?: string,
  ) {
    return this.engine.resolveAndGenerate([segment], parseLocale(locale));
  }

  @Public()
  @Throttle({ default: THROTTLE_DEFAULT })
  @Get('ai-context/resolve')
  @ApiOperation({ summary: 'Structured page context for AI systems (path-based)' })
  buildAiContextForPath(
    @Query('path') path: string,
    @Query('locale') locale?: string,
    @Query('siteUrl') siteUrl?: string,
  ) {
    const segments = parsePathSegments(path);
    const base = siteUrl?.trim() || process.env.STAYS_WEB_URL || 'http://localhost:3005';
    return this.engine.buildAiContextForPath(segments, parseLocale(locale), base);
  }

  @Public()
  @Throttle({ default: THROTTLE_DEFAULT })
  @Get('ai-context/:slug')
  @ApiOperation({ summary: 'Structured destination context for AI systems (GEO)' })
  buildAiContext(
    @Param('slug') slug: string,
    @Query('locale') locale?: string,
    @Query('siteUrl') siteUrl?: string,
  ) {
    const base = siteUrl?.trim() || process.env.STAYS_WEB_URL || 'http://localhost:3005';
    return this.engine.buildAiContext(slug, parseLocale(locale), base);
  }

  @Public()
  @Get('registry/sitemap')
  @ApiOperation({ summary: 'Indexable pages for sitemap generation' })
  sitemapEntries() {
    return this.registry.listIndexableForSitemap();
  }
}
