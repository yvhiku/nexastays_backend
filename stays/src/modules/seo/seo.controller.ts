import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_DEFAULT } from '../../common/abuse/throttle-presets';
import { SeoEngineService } from './seo-engine.service';
import { SeoPageRegistryService } from './seo-page-registry.service';
import { SeoGuideService } from './seo-guide.service';
import { SeoGeoMonitoringService } from './seo-geo-monitoring.service';
import type { SeoGuideType, SeoLocale } from './seo.types';

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

function requestMeta(req: Request) {
  return {
    userAgent: req.headers['user-agent'] ?? null,
    referrer: (req.headers.referer ?? req.headers.referrer ?? null) as string | null,
  };
}

@ApiTags('SEO')
@Controller('stays/seo')
export class SeoController {
  constructor(
    private readonly engine: SeoEngineService,
    private readonly registry: SeoPageRegistryService,
    private readonly guides: SeoGuideService,
    private readonly geoMonitoring: SeoGeoMonitoringService,
  ) {}

  @Public()
  @Get('destinations')
  @ApiOperation({ summary: 'List published SEO destinations' })
  listDestinations() {
    return this.engine.listDestinations();
  }

  @Public()
  @Get('destinations/:slug/related')
  @ApiOperation({ summary: 'Knowledge graph related destinations' })
  async getRelatedDestinations(@Param('slug') slug: string) {
    return this.engine.getRelatedDestinations(slug);
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
  @Get('guides')
  @ApiOperation({ summary: 'List published travel guides' })
  listGuides(
    @Query('locale') locale?: string,
    @Query('type') type?: string,
  ) {
    const guideType =
      type === 'travel' ||
      type === 'experience' ||
      type === 'seasonal' ||
      type === 'event'
        ? (type as SeoGuideType)
        : undefined;
    return this.guides.listGuides(parseLocale(locale), guideType);
  }

  @Public()
  @Get('guides/:slug')
  @ApiOperation({ summary: 'Full guide page payload' })
  getGuide(
    @Param('slug') slug: string,
    @Query('locale') locale?: string,
  ) {
    return this.guides.getGuidePage(slug, parseLocale(locale));
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
  async buildAiContextForPath(
    @Query('path') path: string,
    @Query('locale') locale?: string,
    @Query('siteUrl') siteUrl?: string,
    @Req() req?: Request,
  ) {
    const segments = parsePathSegments(path);
    const loc = parseLocale(locale);
    const base = siteUrl?.trim() || process.env.STAYS_WEB_URL || 'http://localhost:3005';

    if (segments[0] === 'guides' && segments[1]) {
      void this.geoMonitoring.logRequest({
        endpoint: 'ai-context/resolve',
        pageSlug: segments[1],
        locale: loc,
        ...requestMeta(req!),
      });
      return this.guides.buildAiContext(segments[1], loc, base);
    }

    void this.geoMonitoring.logRequest({
      endpoint: 'ai-context/resolve',
      pageSlug: segments.join('/'),
      locale: loc,
      ...requestMeta(req!),
    });
    return this.engine.buildAiContextForPath(segments, loc, base);
  }

  @Public()
  @Throttle({ default: THROTTLE_DEFAULT })
  @Get('ai-context/guides/:slug')
  @ApiOperation({ summary: 'Structured guide context for AI systems (GEO)' })
  async buildGuideAiContext(
    @Param('slug') slug: string,
    @Query('locale') locale?: string,
    @Query('siteUrl') siteUrl?: string,
    @Req() req?: Request,
  ) {
    const loc = parseLocale(locale);
    const base = siteUrl?.trim() || process.env.STAYS_WEB_URL || 'http://localhost:3005';
    void this.geoMonitoring.logRequest({
      endpoint: 'ai-context/guides',
      pageSlug: slug,
      locale: loc,
      ...requestMeta(req!),
    });
    return this.guides.buildAiContext(slug, loc, base);
  }

  @Public()
  @Throttle({ default: THROTTLE_DEFAULT })
  @Get('ai-context/:slug')
  @ApiOperation({ summary: 'Structured destination context for AI systems (GEO)' })
  async buildAiContext(
    @Param('slug') slug: string,
    @Query('locale') locale?: string,
    @Query('siteUrl') siteUrl?: string,
    @Req() req?: Request,
  ) {
    const loc = parseLocale(locale);
    const base = siteUrl?.trim() || process.env.STAYS_WEB_URL || 'http://localhost:3005';
    void this.geoMonitoring.logRequest({
      endpoint: 'ai-context',
      pageSlug: slug,
      locale: loc,
      ...requestMeta(req!),
    });
    return this.engine.buildAiContext(slug, loc, base);
  }

  @Public()
  @Get('registry/sitemap')
  @ApiOperation({ summary: 'Indexable pages for sitemap generation' })
  sitemapEntries() {
    return this.registry.listIndexableForSitemap();
  }
}
