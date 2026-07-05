/**
 * Casablanca launch pricing configuration.
 * Config-driven by ride category. Easy to extend for more cities.
 */
export type RideType = 'economy' | 'comfort' | 'moto';

export interface RideCategoryPricing {
  rideType: RideType;
  baseFare: number; // MAD
  perKm: number; // MAD per km
  perMin: number; // MAD per minute
  minimumFare: number; // MAD
  bookingFee: number; // MAD
  fixedCommission: number; // MAD - deducted from driver payout
}

/** Casablanca pricing for economy, comfort, moto. Recalibrated for competitor parity. */
export const CASABLANCA_PRICING: Record<RideType, RideCategoryPricing> = {
  economy: {
    rideType: 'economy',
    baseFare: 4,
    perKm: 2.0,
    perMin: 0.2,
    minimumFare: 10,
    bookingFee: 1,
    fixedCommission: 2,
  },
  comfort: {
    rideType: 'comfort',
    baseFare: 6,
    perKm: 2.5,
    perMin: 0.25,
    minimumFare: 14,
    bookingFee: 2,
    fixedCommission: 4,
  },
  moto: {
    rideType: 'moto',
    baseFare: 3,
    perKm: 1.4,
    perMin: 0.15,
    minimumFare: 8,
    bookingFee: 1,
    fixedCommission: 1.5,
  },
};

/** Supported ride types for Casablanca. */
export const SUPPORTED_RIDE_TYPES: RideType[] = ['economy', 'comfort', 'moto'];

export function getPricingConfig(
  rideType: string,
  city: string = 'casablanca',
): RideCategoryPricing | null {
  if (city !== 'casablanca') return null;
  const key = rideType.toLowerCase() as RideType;
  if (!SUPPORTED_RIDE_TYPES.includes(key)) return null;
  return CASABLANCA_PRICING[key];
}
