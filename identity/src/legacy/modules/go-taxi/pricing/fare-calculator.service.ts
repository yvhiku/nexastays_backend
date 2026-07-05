import { Injectable, BadRequestException } from '@nestjs/common';
import {
  getPricingConfig,
  RideType,
  RideCategoryPricing,
} from './config/casablanca-pricing.config';

export interface FareCalculationInput {
  rideType: string;
  distanceKm: number;
  durationMin: number;
  surgeMultiplier?: number;
  surcharges?: number;
  promoDiscount?: number;
}

export interface FareCalculationOutput {
  rideType: string;
  currency: string;
  baseFare: number;
  distanceKm: number;
  durationMin: number;
  distanceCharge: number;
  timeCharge: number;
  transportSubtotal: number;
  surgeMultiplier: number;
  surgedTransport: number;
  bookingFee: number;
  surcharges: number;
  grossFareBeforeMin: number;
  minimumFare: number;
  finalFareBeforeDiscount: number;
  promoDiscount: number;
  riderPayable: number;
  fixedCommission: number;
  driverPayout: number;
  platformRevenue: number;
}

/**
 * FareCalculatorService - Nexa Go pricing engine.
 * Formula:
 *   transportSubtotal = baseFare + (distanceKm * perKm) + (durationMin * perMin)
 *   surgedTransport = transportSubtotal * surgeMultiplier
 *   grossFareBeforeMin = surgedTransport + bookingFee + surcharges
 *   finalFare = max(minimumFare, grossFareBeforeMin) rounded to whole MAD
 *   driverPayout = finalFare - fixedCommission
 *   platformRevenue = fixedCommission + bookingFee
 * Promo discount reduces rider payable only, not driver payout.
 */
@Injectable()
export class FareCalculatorService {
  /**
   * Calculate full fare breakdown.
   * @throws BadRequestException for invalid ride type or negative inputs
   */
  calculate(input: FareCalculationInput): FareCalculationOutput {
    const {
      rideType,
      distanceKm,
      durationMin,
      surgeMultiplier = 1.0,
      surcharges = 0,
      promoDiscount = 0,
    } = input;

    if (distanceKm < 0 || durationMin < 0 || surcharges < 0 || promoDiscount < 0) {
      throw new BadRequestException(
        'Distance, duration, surcharges, and promo discount must be non-negative',
      );
    }

    const config = getPricingConfig(rideType);
    if (!config) {
      throw new BadRequestException(
        `Invalid ride type: ${rideType}. Supported: economy, comfort, moto`,
      );
    }

    const sm = Math.max(0.1, surgeMultiplier);
    const distanceCharge = this.round2(distanceKm * config.perKm);
    const timeCharge = this.round2(durationMin * config.perMin);
    const transportSubtotal = this.round2(
      config.baseFare + distanceCharge + timeCharge,
    );
    const surgedTransport = this.round2(transportSubtotal * sm);
    const grossFareBeforeMin = this.round2(
      surgedTransport + config.bookingFee + surcharges,
    );
    const finalFareBeforeDiscount = Math.max(
      config.minimumFare,
      Math.round(grossFareBeforeMin),
    );
    const riderPayable = Math.max(
      0,
      Math.round(finalFareBeforeDiscount - promoDiscount),
    );
    const driverPayout = finalFareBeforeDiscount - config.fixedCommission;
    const platformRevenue = config.fixedCommission + config.bookingFee;

    return {
      rideType: config.rideType,
      currency: 'MAD',
      baseFare: config.baseFare,
      distanceKm: this.round2(distanceKm),
      durationMin: Math.round(durationMin),
      distanceCharge,
      timeCharge,
      transportSubtotal,
      surgeMultiplier: sm,
      surgedTransport,
      bookingFee: config.bookingFee,
      surcharges,
      grossFareBeforeMin,
      minimumFare: config.minimumFare,
      finalFareBeforeDiscount,
      promoDiscount,
      riderPayable,
      fixedCommission: config.fixedCommission,
      driverPayout: this.round2(driverPayout),
      platformRevenue: this.round2(platformRevenue),
    };
  }

  /** Calculate rider payable only (convenience). */
  calculateRiderPayable(input: FareCalculationInput): number {
    return this.calculate(input).riderPayable;
  }

  /** Get pricing config for a ride type (for validation). */
  getConfig(rideType: string): RideCategoryPricing | null {
    return getPricingConfig(rideType);
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
