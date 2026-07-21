export type SeoFilterKind = 'amenity' | 'pets' | 'family' | 'luxury';

export interface SeoPropertyTypeConfig {
  slug: string;
  listingType: 'APARTMENT' | 'HOTEL' | 'RIAD' | 'VILLA' | 'HOSTEL';
  label: string;
  pluralLabel: string;
}

export interface SeoAmenityConfig {
  slug: string;
  filterKind: SeoFilterKind;
  amenityTag?: string | null;
  label: string;
}

export const SEO_PROPERTY_TYPES: SeoPropertyTypeConfig[] = [
  { slug: 'apartments', listingType: 'APARTMENT', label: 'Apartment', pluralLabel: 'Apartments' },
  { slug: 'hotels', listingType: 'HOTEL', label: 'Hotel', pluralLabel: 'Hotels' },
  { slug: 'riads', listingType: 'RIAD', label: 'Riad', pluralLabel: 'Riads' },
  { slug: 'villas', listingType: 'VILLA', label: 'Villa', pluralLabel: 'Villas' },
  { slug: 'hostels', listingType: 'HOSTEL', label: 'Hostel', pluralLabel: 'Hostels' },
];

export const SEO_AMENITIES: SeoAmenityConfig[] = [
  { slug: 'pool', filterKind: 'amenity', amenityTag: 'pool', label: 'Pool' },
  { slug: 'pet-friendly', filterKind: 'pets', label: 'Pet-friendly' },
  { slug: 'free-parking', filterKind: 'amenity', amenityTag: 'parking', label: 'Free parking' },
  { slug: 'wifi', filterKind: 'amenity', amenityTag: 'wifi', label: 'WiFi' },
  { slug: 'family', filterKind: 'family', label: 'Family-friendly' },
  { slug: 'luxury', filterKind: 'luxury', label: 'Luxury' },
];

export interface SeoExploreFilters {
  city?: string;
  listing_type?: string;
  amenity?: string;
  pets_allowed?: boolean;
  luxury_only?: boolean;
  family_friendly?: boolean;
}

export function propertyTypeBySlug(slug: string): SeoPropertyTypeConfig | null {
  return SEO_PROPERTY_TYPES.find((p) => p.slug === slug) ?? null;
}

export function amenityBySlug(slug: string): SeoAmenityConfig | null {
  return SEO_AMENITIES.find((a) => a.slug === slug) ?? null;
}

export function amenityToExploreFilters(amenity: SeoAmenityConfig): SeoExploreFilters {
  switch (amenity.filterKind) {
    case 'amenity':
      return { amenity: amenity.amenityTag ?? amenity.slug };
    case 'pets':
      return { pets_allowed: true };
    case 'family':
      return { family_friendly: true };
    case 'luxury':
      return { luxury_only: true };
    default:
      return {};
  }
}

export type ResolvedSeoPage =
  | { kind: 'city'; citySlug: string }
  | { kind: 'property_type'; typeSlug: string }
  | { kind: 'amenity'; amenitySlug: string }
  | { kind: 'city_property_type'; citySlug: string; typeSlug: string }
  | { kind: 'city_amenity'; citySlug: string; amenitySlug: string };

export function resolveSeoSegments(segments: string[]): ResolvedSeoPage | null {
  const [a, b] = segments.filter(Boolean);
  if (!a) return null;

  if (!b) {
    const pt = propertyTypeBySlug(a);
    if (pt) return { kind: 'property_type', typeSlug: pt.slug };
    const am = amenityBySlug(a);
    if (am) return { kind: 'amenity', amenitySlug: am.slug };
    return { kind: 'city', citySlug: a };
  }

  const pt = propertyTypeBySlug(b);
  if (pt) return { kind: 'city_property_type', citySlug: a, typeSlug: pt.slug };
  const am = amenityBySlug(b);
  if (am) return { kind: 'city_amenity', citySlug: a, amenitySlug: am.slug };
  return null;
}
