import { Injectable } from '@nestjs/common';
import { PricingService } from '../pricing/pricing.service';
import { FareCalculatorService } from '../pricing/fare-calculator.service';
import { SUPPORTED_RIDE_TYPES } from '../pricing/config/casablanca-pricing.config';
import type { FareCalculationOutput } from '../pricing/fare-calculator.service';

export interface FareOption {
  id: string;
  name: string;
  tagline: string;
  etaMinutes: number;
  fareMAD: number;
  passengers: number;
  badge?: string;
  /** Full breakdown when available */
  breakdown?: FareCalculationOutput;
}

const RIDE_TYPE_META: Record<
  string,
  { name: string; tagline: string; passengers: number; badge?: string }
> = {
  moto: {
    name: 'Moto',
    tagline: 'Beat the traffic',
    passengers: 1,
    badge: 'Fastest',
  },
  economy: {
    name: 'Economy',
    tagline: 'Affordable everyday rides',
    passengers: 4,
    badge: 'Cheapest',
  },
  comfort: {
    name: 'Comfort',
    tagline: 'Extra comfort for your trips',
    passengers: 4,
    badge: 'Best rated',
  },
};

@Injectable()
export class FaresService {
  constructor(
    private readonly pricingService: PricingService,
    private readonly fareCalculator: FareCalculatorService,
  ) {}

  /**
   * Estimate fares from coordinates (Haversine distance, estimated time).
   * Returns options for economy, comfort, moto with full breakdown.
   */
  async estimateFares(
    pickupLat: number,
    pickupLng: number,
    dropoffLat: number,
    dropoffLng: number,
  ): Promise<FareOption[]> {
    const distance = this.pricingService.calculateDistance(
      pickupLat,
      pickupLng,
      dropoffLat,
      dropoffLng,
    );
    const timeMinutes = this.pricingService.estimateTime(distance);
    return this.estimateFaresFromRoute(distance, timeMinutes);
  }

  /**
   * Estimate fares from route distance and duration.
   * Use when client has Directions API result.
   */
  async estimateFaresFromRoute(
    distanceKm: number,
    durationMin: number,
  ): Promise<FareOption[]> {
    const options: FareOption[] = [];
    const etaBase = Math.max(1, Math.round(durationMin));

    for (const rideType of SUPPORTED_RIDE_TYPES) {
      const breakdown = this.fareCalculator.calculate({
        rideType,
        distanceKm,
        durationMin,
      });
      const meta = RIDE_TYPE_META[rideType] ?? {
        name: rideType.charAt(0).toUpperCase() + rideType.slice(1),
        tagline: '',
        passengers: 4,
      };
      options.push({
        id: rideType,
        name: meta.name,
        tagline: meta.tagline,
        etaMinutes: etaBase,
        fareMAD: breakdown.riderPayable,
        passengers: meta.passengers,
        badge: meta.badge,
        breakdown,
      });
    }

    return options;
  }

  /**
   * Get single fare breakdown for a ride type.
   */
  async getFareBreakdown(
    distanceKm: number,
    durationMin: number,
    rideType: string,
    surgeMultiplier?: number,
    surcharges?: number,
    promoDiscount?: number,
  ): Promise<FareCalculationOutput> {
    return this.fareCalculator.calculate({
      rideType,
      distanceKm,
      durationMin,
      surgeMultiplier,
      surcharges,
      promoDiscount,
    });
  }
}
