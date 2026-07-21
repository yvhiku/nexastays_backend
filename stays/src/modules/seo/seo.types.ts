export type SeoLocale = 'en' | 'fr' | 'ar';

export type SeoPageType =
  | 'city'
  | 'property_type'
  | 'amenity'
  | 'city_property_type'
  | 'city_amenity'
  | 'city_neighborhood'
  | 'landmark'
  | 'guide'
  | 'listing';

export type SeoGuideType = 'travel' | 'experience' | 'seasonal' | 'event';

export type SeoRelationType =
  | 'near'
  | 'similar'
  | 'beach_alternative'
  | 'luxury_alternative'
  | 'day_trip'
  | 'surf_alternative';

export type AiSnippetType =
  | 'summary'
  | 'price'
  | 'safety'
  | 'transport'
  | 'family'
  | 'nightlife'
  | 'couples'
  | 'nomads'
  | 'amenities'
  | 'seasonality';

export interface AiSnippet {
  type: AiSnippetType;
  content: string;
  confidence: number;
  source: 'marketplace' | 'editorial' | 'ai_draft';
}

export interface GeoBlockDto {
  question: string;
  answer: string;
  statKey?: string | null;
}

export interface DestinationIntelligence {
  listingCount: number;
  verifiedCount: number;
  avgNightlyPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  luxuryCount: number;
  avgRating: number | null;
  reviewCount: number;
  topNeighborhood: string | null;
  bestMonth: string | null;
  topAmenities: string[];
  topPropertyType: string | null;
  verifiedPercent: number | null;
  currency: string;
}

export interface SeoExploreFiltersDto {
  city?: string;
  listing_type?: string;
  amenity?: string;
  neighborhood?: string;
  pets_allowed?: boolean;
  luxury_only?: boolean;
  family_friendly?: boolean;
  near_lat?: number;
  near_lng?: number;
  near_radius_km?: number;
}

export interface SeoNeighborhoodDto {
  slug: string;
  name: string;
  searchTerm: string;
}

export interface SeoLandmarkDto {
  slug: string;
  urlSlug: string;
  name: string;
  citySlug: string | null;
  searchCity: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
}

export interface RelatedDestinationDto {
  slug: string;
  name: string;
  relationType: SeoRelationType;
  href: string;
}

export interface SeoDestinationDto {
  id: string;
  slug: string;
  name: string;
  countryCode: string;
  regionId: string | null;
  latitude: number | null;
  longitude: number | null;
  heroImageUrl: string | null;
  bestTimeToVisit: string | null;
  nearbyCitySlugs: string[];
  searchCity: string;
  indexable: boolean;
  seoScore: number;
  listingCountCache: number;
}

export interface SeoPagePayload {
  pageType: SeoPageType;
  locale: SeoLocale;
  path: string;
  title: string;
  description: string;
  h1: string;
  canonical: string;
  hreflang: Record<string, string>;
  robots: string;
  destination: SeoDestinationDto | null;
  neighborhood: SeoNeighborhoodDto | null;
  landmark: SeoLandmarkDto | null;
  filterLabel: string | null;
  exploreFilters: SeoExploreFiltersDto;
  intelligence: DestinationIntelligence;
  geoBlocks: GeoBlockDto[];
  faq: GeoBlockDto[];
  aiSnippets: AiSnippet[];
  nearbyDestinations: SeoDestinationDto[];
  relatedDestinations: RelatedDestinationDto[];
  propertyTypeLinks: { slug: string; label: string; href: string }[];
  amenityLinks: { slug: string; label: string; href: string }[];
  neighborhoodLinks: { slug: string; label: string; href: string }[];
  breadcrumbs: { name: string; path: string }[];
  contentBlocks?: SeoLandingContentBlocks;
  cityGuideLink?: { slug: string; href: string; label: string } | null;
  relatedGuides?: SeoGuideSummaryDto[];
  indexable: boolean;
  seoScore: number;
  lastmod: string;
  registrySlug: string;
}

export interface SeoGuideSummaryDto {
  slug: string;
  guideType: SeoGuideType;
  title: string;
  description: string;
  destinationSlug: string | null;
  destinationName: string | null;
  href: string;
  seoScore: number;
}

export interface SeoGuidePagePayload {
  pageType: 'guide';
  locale: SeoLocale;
  slug: string;
  guideType: SeoGuideType;
  path: string;
  title: string;
  description: string;
  h1: string;
  canonical: string;
  hreflang: Record<string, string>;
  robots: string;
  bodyHtml: string;
  geoBlocks: GeoBlockDto[];
  destination: SeoDestinationDto | null;
  intelligence: DestinationIntelligence | null;
  relatedGuides: SeoGuideSummaryDto[];
  cityGuideLink: { slug: string; href: string; label: string } | null;
  exploreFilters: SeoExploreFiltersDto;
  breadcrumbs: { name: string; path: string }[];
  indexable: boolean;
  seoScore: number;
  lastmod: string;
}

export interface SeoListingPagePayload {
  pageType: 'listing';
  locale: SeoLocale;
  listingId: string;
  path: string;
  title: string;
  description: string;
  h1: string;
  canonical: string;
  hreflang: Record<string, string>;
  robots: string;
  ogImageUrl: string | null;
  listingType: string;
  city: string;
  neighborhood: string | null;
  basePrice: number | null;
  currency: string;
  avgRating: number | null;
  reviewCount: number;
  hasWalkthrough: boolean;
  geoLat: number | null;
  geoLng: number | null;
  breadcrumbs: { name: string; path: string }[];
  indexable: boolean;
  seoScore: number;
  lastmod: string;
}

export interface SeoContentVersionDto {
  id: string;
  entityType: string;
  entityId: string;
  locale: string;
  version: number;
  fieldName: string;
  status: string;
  createdAt: string;
  publishedAt: string | null;
}

import type { SeoLandingContentBlocks } from './seo-landing-content.types';

export interface SeoGeoOverview {
  periodDays: number;
  totalRequests: number;
  requestsPerWeek: number;
  topDestinations: { slug: string; count: number }[];
  byEndpoint: Record<string, number>;
}

export interface AiContextPayload {
  pageType: SeoPageType;
  destination: string | null;
  country: string;
  summary: string;
  listingCount: number;
  verifiedCount: number;
  averagePrice: number | null;
  minPrice: number | null;
  currency: string;
  averageRating: number | null;
  bestArea: string | null;
  familyArea: string | null;
  nightlifeArea: string | null;
  couplesArea: string | null;
  nomadArea: string | null;
  topAmenities: string[];
  bestMonth: string | null;
  safety: string | null;
  transport: string | null;
  snippets: AiSnippet[];
  canonicalUrl: string;
  lastUpdated: string;
}

export interface SitemapEntryDto {
  path: string;
  locale: string;
  lastmod: string;
  priority: number;
}

export interface SeoAdminOverview {
  indexedPages: number;
  totalRegistryPages: number;
  sitemapPages: number;
  thinContentPages: number;
  avgSeoScore: number;
  missingHeroImages: number;
  pageTypeBreakdown: Record<string, number>;
}

export interface SeoAdminPageRow {
  pageType: string;
  slug: string;
  locale: string;
  path: string;
  indexable: boolean;
  seoScore: number;
  lastmod: string;
}
