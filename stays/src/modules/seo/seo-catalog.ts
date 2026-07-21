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

export interface SeoNeighborhoodConfig {
  slug: string;
  name: string;
  searchTerm: string;
}

export interface SeoLandmarkConfig {
  slug: string;
  urlSlug: string;
  name: string;
  citySlug: string;
  searchCity: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
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

/** City slug → neighborhoods (mirrors explore catalog + migration 030). */
export const SEO_NEIGHBORHOODS_BY_CITY: Record<string, SeoNeighborhoodConfig[]> = {
  marrakech: [
    { slug: 'medina', name: 'Medina', searchTerm: 'Medina' },
    { slug: 'gueliz', name: 'Gueliz', searchTerm: 'Gueliz' },
    { slug: 'hivernage', name: 'Hivernage', searchTerm: 'Hivernage' },
    { slug: 'palmeraie', name: 'Palmeraie', searchTerm: 'Palmeraie' },
  ],
  casablanca: [
    { slug: 'maarif', name: 'Maarif', searchTerm: 'Maarif' },
    { slug: 'ain-diab', name: 'Ain Diab', searchTerm: 'Ain Diab' },
    { slug: 'habous', name: 'Habous', searchTerm: 'Habous' },
    { slug: 'anfa', name: 'Anfa', searchTerm: 'Anfa' },
    { slug: 'sidi-maarouf', name: 'Sidi Maarouf', searchTerm: 'Sidi Maarouf' },
    { slug: 'gauthier', name: 'Gauthier', searchTerm: 'Gauthier' },
  ],
  agadir: [
    { slug: 'marina', name: 'Marina', searchTerm: 'Marina' },
    { slug: 'founty', name: 'Founty', searchTerm: 'Founty' },
    { slug: 'talborjt', name: 'Talborjt', searchTerm: 'Talborjt' },
    { slug: 'sonaba', name: 'Sonaba', searchTerm: 'Sonaba' },
  ],
  rabat: [
    { slug: 'agdal', name: 'Agdal', searchTerm: 'Agdal' },
    { slug: 'souissi', name: 'Souissi', searchTerm: 'Souissi' },
    { slug: 'hassan', name: 'Hassan', searchTerm: 'Hassan' },
    { slug: 'medina', name: 'Medina', searchTerm: 'Medina' },
  ],
  fes: [
    { slug: 'fes-el-bali', name: 'Fes el-Bali', searchTerm: 'Fes el-Bali' },
    { slug: 'ville-nouvelle', name: 'Ville Nouvelle', searchTerm: 'Ville Nouvelle' },
    { slug: 'mellah', name: 'Mellah', searchTerm: 'Mellah' },
  ],
  tangier: [
    { slug: 'kasbah', name: 'Kasbah', searchTerm: 'Kasbah' },
    { slug: 'malabata', name: 'Malabata', searchTerm: 'Malabata' },
    { slug: 'marshan', name: 'Marshan', searchTerm: 'Marshan' },
    { slug: 'iberia', name: 'Iberia', searchTerm: 'Iberia' },
  ],
  essaouira: [
    { slug: 'medina', name: 'Medina', searchTerm: 'Medina' },
    { slug: 'diabat', name: 'Diabat', searchTerm: 'Diabat' },
  ],
  chefchaouen: [
    { slug: 'medina', name: 'Medina', searchTerm: 'Medina' },
    { slug: 'ras-el-ma', name: 'Ras El Ma', searchTerm: 'Ras El Ma' },
  ],
  tetouan: [
    { slug: 'medina', name: 'Medina', searchTerm: 'Medina' },
    { slug: 'ensanche', name: 'Ensanche', searchTerm: 'Ensanche' },
  ],
  ifrane: [{ slug: 'centre-ville', name: 'Centre-ville', searchTerm: 'Centre-ville' }],
};

export const SEO_LANDMARKS: SeoLandmarkConfig[] = [
  { slug: 'jemaa-el-fnaa', urlSlug: 'near-jemaa-el-fnaa', name: 'Jemaa el-Fnaa', citySlug: 'marrakech', searchCity: 'Marrakech', latitude: 31.6258257, longitude: -7.9891608, radiusKm: 1.5 },
  { slug: 'koutoubia', urlSlug: 'near-koutoubia', name: 'Koutoubia Mosque', citySlug: 'marrakech', searchCity: 'Marrakech', latitude: 31.6238889, longitude: -7.9938889, radiusKm: 1.0 },
  { slug: 'bahia-palace', urlSlug: 'near-bahia-palace', name: 'Bahia Palace', citySlug: 'marrakech', searchCity: 'Marrakech', latitude: 31.6217, longitude: -7.9847, radiusKm: 1.0 },
  { slug: 'hassan-ii-mosque', urlSlug: 'near-hassan-ii-mosque', name: 'Hassan II Mosque', citySlug: 'casablanca', searchCity: 'Casablanca', latitude: 33.6086, longitude: -7.6328, radiusKm: 2.0 },
  { slug: 'mohammed-v-square', urlSlug: 'near-mohammed-v-square', name: 'Mohammed V Square', citySlug: 'casablanca', searchCity: 'Casablanca', latitude: 33.5933, longitude: -7.6167, radiusKm: 1.5 },
  { slug: 'hassan-tower', urlSlug: 'near-hassan-tower', name: 'Hassan Tower', citySlug: 'rabat', searchCity: 'Rabat', latitude: 34.0244, longitude: -6.8225, radiusKm: 1.5 },
  { slug: 'kasbah-oudayas', urlSlug: 'near-kasbah-oudayas', name: 'Kasbah of the Udayas', citySlug: 'rabat', searchCity: 'Rabat', latitude: 34.0311, longitude: -6.8367, radiusKm: 1.5 },
  { slug: 'chouara-tannery', urlSlug: 'near-chouara-tannery', name: 'Chouara Tannery', citySlug: 'fes', searchCity: 'Fes', latitude: 34.0661, longitude: -4.9717, radiusKm: 1.0 },
  { slug: 'bab-bou-jeloud', urlSlug: 'near-bab-bou-jeloud', name: 'Bab Bou Jeloud', citySlug: 'fes', searchCity: 'Fes', latitude: 34.0525, longitude: -4.9986, radiusKm: 1.0 },
  { slug: 'tangier-medina', urlSlug: 'near-tangier-medina', name: 'Tangier Medina', citySlug: 'tangier', searchCity: 'Tangier', latitude: 35.7887531, longitude: -5.8134345, radiusKm: 1.5 },
  { slug: 'essaouira-ramparts', urlSlug: 'near-essaouira-ramparts', name: 'Essaouira Ramparts', citySlug: 'essaouira', searchCity: 'Essaouira', latitude: 31.5145596, longitude: -9.7688948, radiusKm: 1.5 },
  { slug: 'chefchaouen-medina', urlSlug: 'near-chefchaouen-medina', name: 'Chefchaouen Medina', citySlug: 'chefchaouen', searchCity: 'Chefchaouen', latitude: 35.1693741, longitude: -5.2612741, radiusKm: 1.5 },
  { slug: 'agadir-beach', urlSlug: 'near-agadir-beach', name: 'Agadir Beach', citySlug: 'agadir', searchCity: 'Agadir', latitude: 30.4278, longitude: -9.5981, radiusKm: 2.5 },
];

export interface SeoExploreFilters {
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

export function propertyTypeBySlug(slug: string): SeoPropertyTypeConfig | null {
  return SEO_PROPERTY_TYPES.find((p) => p.slug === slug) ?? null;
}

export function amenityBySlug(slug: string): SeoAmenityConfig | null {
  return SEO_AMENITIES.find((a) => a.slug === slug) ?? null;
}

export function neighborhoodBySlugs(
  citySlug: string,
  neighborhoodSlug: string,
): SeoNeighborhoodConfig | null {
  return SEO_NEIGHBORHOODS_BY_CITY[citySlug]?.find((n) => n.slug === neighborhoodSlug) ?? null;
}

export function landmarkByUrlSlug(urlSlug: string): SeoLandmarkConfig | null {
  return SEO_LANDMARKS.find((l) => l.urlSlug === urlSlug) ?? null;
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

export function neighborhoodToExploreFilters(
  citySearch: string,
  neighborhood: SeoNeighborhoodConfig,
): SeoExploreFilters {
  return { city: citySearch, neighborhood: neighborhood.searchTerm };
}

export function landmarkToExploreFilters(landmark: SeoLandmarkConfig): SeoExploreFilters {
  return {
    city: landmark.searchCity,
    near_lat: landmark.latitude,
    near_lng: landmark.longitude,
    near_radius_km: landmark.radiusKm,
  };
}

export type ResolvedSeoPage =
  | { kind: 'city'; citySlug: string }
  | { kind: 'property_type'; typeSlug: string }
  | { kind: 'amenity'; amenitySlug: string }
  | { kind: 'city_property_type'; citySlug: string; typeSlug: string }
  | { kind: 'city_amenity'; citySlug: string; amenitySlug: string }
  | { kind: 'city_neighborhood'; citySlug: string; neighborhoodSlug: string }
  | { kind: 'landmark'; landmarkUrlSlug: string };

export function resolveSeoSegments(segments: string[]): ResolvedSeoPage | null {
  const [a, b] = segments.filter(Boolean);
  if (!a) return null;

  if (!b) {
    const lm = landmarkByUrlSlug(a);
    if (lm) return { kind: 'landmark', landmarkUrlSlug: lm.urlSlug };
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
  const nb = neighborhoodBySlugs(a, b);
  if (nb) return { kind: 'city_neighborhood', citySlug: a, neighborhoodSlug: nb.slug };
  return null;
}
