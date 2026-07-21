import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Throttle } from '@nestjs/throttler';
import { THROTTLE_DEFAULT } from '../../common/abuse/throttle-presets';
import { SeoEngineService } from './seo-engine.service';
import { SeoPageRegistryService } from './seo-page-registry.service';
import type { SeoLocale } from './seo.types';

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
  @Get('pages/city/:slug')
  @ApiOperation({ summary: 'Full SEO page payload for a city landing page' })
  generateCityPage(
    @Param('slug') slug: string,
    @Query('locale') locale?: string,
  ) {
    const loc = (locale === 'fr' || locale === 'ar' ? locale : 'en') as SeoLocale;
    return this.engine.generateCityPage(slug, loc);
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
    const loc = (locale === 'fr' || locale === 'ar' ? locale : 'en') as SeoLocale;
    const base = siteUrl?.trim() || process.env.STAYS_WEB_URL || 'http://localhost:3005';
    return this.engine.buildAiContext(slug, loc, base);
  }

  @Public()
  @Get('registry/sitemap')
  @ApiOperation({ summary: 'Indexable pages for sitemap generation' })
  sitemapEntries() {
    return this.registry.listIndexableForSitemap();
  }
}
