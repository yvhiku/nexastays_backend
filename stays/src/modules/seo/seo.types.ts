export type SeoLocale = 'en' | 'fr' | 'ar';

export type SeoPageType =
  | 'city'
  | 'property_type'
  | 'amenity'
  | 'city_property_type'
  | 'city_amenity';

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
  currency: string;
}

export interface SeoExploreFiltersDto {
  city?: string;
  listing_type?: string;
  amenity?: string;
  pets_allowed?: boolean;
  luxury_only?: boolean;
  family_friendly?: boolean;
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
  filterLabel: string | null;
  exploreFilters: SeoExploreFiltersDto;
  intelligence: DestinationIntelligence;
  geoBlocks: GeoBlockDto[];
  faq: GeoBlockDto[];
  aiSnippets: AiSnippet[];
  nearbyDestinations: SeoDestinationDto[];
  propertyTypeLinks: { slug: string; label: string; href: string }[];
  amenityLinks: { slug: string; label: string; href: string }[];
  breadcrumbs: { name: string; path: string }[];
  indexable: boolean;
  seoScore: number;
  lastmod: string;
  registrySlug: string;
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
