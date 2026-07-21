import type { SeoDestination } from './entities/seo-destination.entity';
import type { DestinationIntelligence } from './seo.types';

const INDEXABLE_SCORE_THRESHOLD = 75;
const MIN_LISTINGS_INDEXABLE = 3;

export function computeSeoQualityScore(args: {
  intelligence: DestinationIntelligence;
  destination?: SeoDestination | null;
  hasHeroImage?: boolean;
  nearbyCount?: number;
  contentRichness?: number;
}): number {
  const { intelligence: intel, destination, hasHeroImage, nearbyCount, contentRichness } = args;
  const listingScore = Math.min(100, (intel.listingCount / 20) * 100);
  const contentScore =
    contentRichness ??
    (destination?.hero_image_url || hasHeroImage ? 80 : 60);
  const reviewScore =
    intel.avgRating != null ? Math.min(100, (intel.avgRating / 5) * 100) : 40;
  const imageScore = destination?.hero_image_url || hasHeroImage ? 90 : 50;
  const linkScore = (nearbyCount ?? destination?.nearby_city_slugs?.length ?? 0) > 0 ? 70 : 40;

  return Math.round(
    listingScore * 0.4 +
      contentScore * 0.3 +
      reviewScore * 0.15 +
      imageScore * 0.1 +
      linkScore * 0.05,
  );
}

export function isPageIndexable(args: {
  seoScore: number;
  listingCount: number;
  published?: boolean;
}): boolean {
  return (
    args.published !== false &&
    args.listingCount >= MIN_LISTINGS_INDEXABLE &&
    args.seoScore >= INDEXABLE_SCORE_THRESHOLD
  );
}

const LISTING_INDEXABLE_SCORE_THRESHOLD = 70;

export function computeListingSeoScore(args: {
  photoCount: number;
  descriptionLength: number;
  reviewCount: number;
  avgRating: number | null;
  hasWalkthrough: boolean;
}): number {
  const photoScore = Math.min(100, args.photoCount >= 5 ? 100 : args.photoCount >= 1 ? 70 : 0);
  const descScore = Math.min(100, (args.descriptionLength / 200) * 100);
  const reviewScore =
    args.avgRating != null
      ? Math.min(100, (args.avgRating / 5) * 100)
      : args.reviewCount > 0
        ? 50
        : 30;
  const walkthroughScore = args.hasWalkthrough ? 100 : 40;

  return Math.round(
    photoScore * 0.35 + descScore * 0.3 + reviewScore * 0.2 + walkthroughScore * 0.15,
  );
}

export function isListingIndexable(args: {
  seoScore: number;
  photoCount: number;
  titleLength: number;
  descriptionLength: number;
  status: string;
}): boolean {
  return (
    args.status === 'LIVE' &&
    args.photoCount >= 1 &&
    args.titleLength >= 5 &&
    args.descriptionLength >= 30 &&
    args.seoScore >= LISTING_INDEXABLE_SCORE_THRESHOLD
  );
}

export { INDEXABLE_SCORE_THRESHOLD, MIN_LISTINGS_INDEXABLE, LISTING_INDEXABLE_SCORE_THRESHOLD };
