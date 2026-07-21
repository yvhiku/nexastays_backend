import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaysListing } from '../stays/entities/stays-listing.entity';
import {
  computeListingSeoScore,
  isListingIndexable,
} from './seo-quality-scoring.service';
import type { SeoListingPagePayload, SeoLocale } from './seo.types';

const LOCALES: SeoLocale[] = ['en', 'fr', 'ar'];

@Injectable()
export class SeoListingService {
  constructor(
    @InjectRepository(StaysListing)
    private readonly listingRepo: Repository<StaysListing>,
  ) {}

  async buildListingPage(
    listingId: string,
    locale: SeoLocale,
  ): Promise<SeoListingPagePayload> {
    const listing = await this.listingRepo.findOne({
      where: { id: listingId },
      relations: ['rate_plan', 'rules', 'media'],
    });

    if (!listing || listing.status !== 'LIVE') {
      throw new NotFoundException('Listing not found');
    }

    const photos = (listing.media ?? []).filter((m) => m.kind === 'PHOTO');
    const hasWalkthrough = (listing.media ?? []).some((m) => m.kind === 'WALKTHROUGH');
    const description = listing.description?.trim() ?? '';
    const title = listing.title?.trim() ?? 'Stay in Morocco';
    const city = listing.city?.trim() ?? 'Morocco';
    const neighborhood = listing.neighborhood?.trim() || null;

    const seoScore = computeListingSeoScore({
      photoCount: photos.length,
      descriptionLength: description.length,
      reviewCount: listing.review_count ?? 0,
      avgRating: listing.avg_rating != null ? Number(listing.avg_rating) : null,
      hasWalkthrough,
    });

    const indexable = isListingIndexable({
      seoScore,
      photoCount: photos.length,
      titleLength: title.length,
      descriptionLength: description.length,
      status: listing.status,
    });

    const path = `/${locale}/listings/${listing.id}`;
    const h1 = title;
    const metaTitle = `${title} in ${city} | Nexa Stays`;
    const metaDescription = this.buildDescription({
      title,
      city,
      listingType: listing.listing_type,
      description,
      basePrice: listing.rate_plan ? Number(listing.rate_plan.base_price) : null,
      currency: listing.rate_plan?.currency ?? 'MAD',
      hasWalkthrough,
    });

    const apiBase = (
      process.env.STAYS_API_PUBLIC_URL ||
      process.env.NEXT_PUBLIC_STAYS_API_BASE_URL ||
      'http://127.0.0.1:3002/api/v1'
    ).replace(/\/$/, '');
    const ogImageUrl =
      photos.length > 0
        ? `${apiBase}/stays/listings/${listing.id}/media/${photos[0]!.asset_id}`
        : null;

    const citySlug = city.toLowerCase().replace(/\s+/g, '-');

    return {
      pageType: 'listing',
      locale,
      listingId: listing.id,
      path,
      title: metaTitle,
      description: metaDescription,
      h1,
      canonical: path,
      hreflang: Object.fromEntries(
        LOCALES.map((loc) => [loc, `/${loc}/listings/${listing.id}`]),
      ),
      robots: indexable ? 'index,follow' : 'noindex,follow',
      ogImageUrl,
      listingType: listing.listing_type,
      city,
      neighborhood,
      basePrice: listing.rate_plan ? Number(listing.rate_plan.base_price) : null,
      currency: listing.rate_plan?.currency ?? 'MAD',
      avgRating: listing.avg_rating != null ? Number(listing.avg_rating) : null,
      reviewCount: listing.review_count ?? 0,
      hasWalkthrough,
      geoLat: listing.geo_lat != null ? Number(listing.geo_lat) : null,
      geoLng: listing.geo_lng != null ? Number(listing.geo_lng) : null,
      breadcrumbs: [
        { name: 'Home', path: `/${locale}` },
        { name: 'Listings', path: `/${locale}/listings` },
        { name: city, path: `/${locale}/stays/${citySlug}` },
        { name: title, path },
      ],
      indexable,
      seoScore,
      lastmod: (listing.updated_at ?? listing.created_at).toISOString(),
    };
  }

  private buildDescription(args: {
    title: string;
    city: string;
    listingType: string;
    description: string;
    basePrice: number | null;
    currency: string;
    hasWalkthrough: boolean;
  }): string {
    if (args.description.length >= 80) {
      return args.description.length > 160
        ? `${args.description.slice(0, 157)}…`
        : args.description;
    }

    const typeLabel = args.listingType.toLowerCase().replace(/_/g, ' ');
    const pricePart =
      args.basePrice != null
        ? ` From ${args.basePrice} ${args.currency}/night.`
        : '';
    const verifiedPart = args.hasWalkthrough ? ' Verified walkthrough.' : '';

    return `Book ${args.title} — a ${typeLabel} in ${args.city}.${pricePart}${verifiedPart} Secure booking on Nexa Stays.`;
  }
}
