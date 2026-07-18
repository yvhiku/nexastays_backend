/**
 * Listing completion flags + weighted %.
 * Single source of truth for submit gates and dashboard progress.
 * Change weights here without migrating rows.
 */

export type ListingCompletionFlags = {
  location_complete: boolean;
  about_complete: boolean;
  pricing_complete: boolean;
  photos_complete: boolean;
  photos_quality_complete: boolean;
  rooms_complete: boolean;
  walkthrough_complete: boolean;
  amenities_complete: boolean;
  house_rules_complete: boolean;
};

export const COMPLETION_WEIGHTS = {
  location: 20,
  about: 20,
  pricing: 20,
  photos: 30,
  walkthrough: 5,
  optional: 5, // amenities / house rules / 12 photos quality
} as const;

export const SUBMIT_MIN_PHOTOS = 5;
export const QUALITY_TARGET_PHOTOS = 12;

export function roomsRequiredForType(
  listingType: string,
  bookingModel: string | null | undefined,
): boolean {
  if (listingType === 'HOTEL' || listingType === 'HOSTEL') return true;
  if (listingType === 'RIAD') {
    return bookingModel === 'ROOM_TYPES' || bookingModel === 'BOTH';
  }
  return false;
}

export type CompletionInput = {
  listing_type: string;
  booking_model?: string | null;
  title?: string | null;
  city?: string | null;
  address?: string | null;
  geo_lat?: number | null;
  geo_lng?: number | null;
  description?: string | null;
  max_guests?: number | null;
  base_price?: number | null;
  photo_count: number;
  has_walkthrough: boolean;
  unit_count: number;
  amenities_count?: number;
  has_house_rules_touch?: boolean;
  guest_house?: boolean;
};

export function computeCompletionFlags(input: CompletionInput): ListingCompletionFlags {
  const roomsNeeded = roomsRequiredForType(
    input.listing_type,
    input.booking_model,
  );
  const pricingOk = roomsNeeded
    ? input.unit_count > 0 && (input.base_price ?? 0) > 0
    : (input.base_price ?? 0) > 0;

  return {
    location_complete: Boolean(
      input.city?.trim() &&
        input.address?.trim() &&
        input.geo_lat != null &&
        input.geo_lng != null,
    ),
    about_complete: Boolean(
      input.title?.trim() &&
        input.title.trim() !== 'Untitled listing' &&
        (input.description?.trim()?.length ?? 0) >= 20 &&
        (input.max_guests ?? 0) >= 1,
    ),
    pricing_complete: pricingOk,
    photos_complete: input.photo_count >= SUBMIT_MIN_PHOTOS,
    photos_quality_complete: input.photo_count >= QUALITY_TARGET_PHOTOS,
    rooms_complete: roomsNeeded ? input.unit_count > 0 : true,
    walkthrough_complete: input.has_walkthrough,
    amenities_complete: (input.amenities_count ?? 0) > 0,
    house_rules_complete: Boolean(input.has_house_rules_touch),
  };
}

export function computeCompletionPercentage(flags: ListingCompletionFlags): number {
  let score = 0;
  if (flags.location_complete) score += COMPLETION_WEIGHTS.location;
  if (flags.about_complete) score += COMPLETION_WEIGHTS.about;
  if (flags.pricing_complete) score += COMPLETION_WEIGHTS.pricing;
  if (flags.photos_complete) score += COMPLETION_WEIGHTS.photos;
  if (flags.walkthrough_complete) score += COMPLETION_WEIGHTS.walkthrough;

  const optionalBits = [
    flags.photos_quality_complete,
    flags.amenities_complete,
    flags.house_rules_complete,
  ].filter(Boolean).length;
  if (optionalBits > 0) {
    score += Math.round((COMPLETION_WEIGHTS.optional * optionalBits) / 3);
  }

  // Rooms required: if incomplete, cap progress feel by not adding pricing/rooms fully —
  // rooms_complete already gates pricing for hotels via pricingOk.
  if (!flags.rooms_complete) {
    score = Math.min(score, 55);
  }

  return Math.min(100, Math.max(0, score));
}

export function assertCanSubmit(flags: ListingCompletionFlags): string | null {
  if (!flags.location_complete) return 'Location (city, address, and map pin) is required.';
  if (!flags.about_complete) return 'Title, description (20+ characters), and guest capacity are required.';
  if (!flags.rooms_complete) return 'Room configuration is required for this property type.';
  if (!flags.pricing_complete) return 'Pricing is required.';
  if (!flags.photos_complete) {
    return `At least ${SUBMIT_MIN_PHOTOS} photos are required to submit.`;
  }
  return null;
}

export type MissingItem = { key: string; label: string; required: boolean };

export function listMissing(flags: ListingCompletionFlags): MissingItem[] {
  const items: MissingItem[] = [];
  if (!flags.location_complete) {
    items.push({ key: 'location', label: 'Location', required: true });
  }
  if (!flags.about_complete) {
    items.push({ key: 'about', label: 'About your property', required: true });
  }
  if (!flags.rooms_complete) {
    items.push({ key: 'rooms', label: 'Room configuration', required: true });
  }
  if (!flags.pricing_complete) {
    items.push({ key: 'pricing', label: 'Pricing', required: true });
  }
  if (!flags.photos_complete) {
    items.push({
      key: 'photos',
      label: `${SUBMIT_MIN_PHOTOS} photos`,
      required: true,
    });
  }
  if (!flags.walkthrough_complete) {
    items.push({ key: 'walkthrough', label: 'Walkthrough video', required: false });
  }
  if (!flags.photos_quality_complete) {
    items.push({
      key: 'photos_quality',
      label: `${QUALITY_TARGET_PHOTOS} photos (recommended)`,
      required: false,
    });
  }
  if (!flags.amenities_complete) {
    items.push({ key: 'amenities', label: 'Amenities', required: false });
  }
  if (!flags.house_rules_complete) {
    items.push({ key: 'house_rules', label: 'House rules', required: false });
  }
  return items;
}
