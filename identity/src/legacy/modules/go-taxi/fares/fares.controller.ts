import { Controller, Get, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FaresService } from './fares.service';
import { GoPricingService } from '../pricing/go-pricing.service';
import { FareEstimateDto } from '../pricing/dto/fare-estimate.dto';

@ApiTags('Go Fares')
@Controller('go/fares')
export class FaresController {
  constructor(
    private readonly faresService: FaresService,
    private readonly goPricingService: GoPricingService,
  ) {}

  /**
   * Estimate fares for pickup and dropoff coordinates.
   * Backend computes distance (Haversine) and time.
   * Returns options for economy, comfort, moto with full breakdown.
   */
  @Get('estimate')
  @ApiOperation({ summary: 'Estimate fares from coordinates' })
  async estimate(
    @Query('pickup_lat') pickupLat: string,
    @Query('pickup_lng') pickupLng: string,
    @Query('dropoff_lat') dropoffLat: string,
    @Query('dropoff_lng') dropoffLng: string,
  ) {
    const pl = parseFloat(pickupLat);
    const pn = parseFloat(pickupLng);
    const dl = parseFloat(dropoffLat);
    const dn = parseFloat(dropoffLng);
    if (
      Number.isNaN(pl) ||
      Number.isNaN(pn) ||
      Number.isNaN(dl) ||
      Number.isNaN(dn)
    ) {
      return { options: [] };
    }
    const options = await this.faresService.estimateFares(pl, pn, dl, dn);
    return { options };
  }

  /**
   * Estimate fares from route distance and duration.
   * Use when client has Directions API result for more accurate estimates.
   * Returns options for economy, comfort, moto with full breakdown.
   */
  @Get('estimate/route')
  @ApiOperation({ summary: 'Estimate fares from route distance and duration' })
  async estimateFromRoute(
    @Query('distance_km') distanceKm: string,
    @Query('duration_min') durationMin: string,
  ) {
    const d = parseFloat(distanceKm);
    const t = parseFloat(durationMin);
    if (Number.isNaN(d) || Number.isNaN(t) || d < 0 || t < 0) {
      return { options: [] };
    }
    const options = await this.faresService.estimateFaresFromRoute(d, t);
    return { options };
  }

  /**
   * Config-driven fare estimate for a single vehicle type (returns FareEstimateDto).
   */
  @Get('estimate/:vehicleType')
  @ApiOperation({ summary: 'Estimate fare for vehicle type (config-driven)' })
  async estimateForVehicle(
    @Param('vehicleType') vehicleType: string,
    @Query('distance_km') distanceKm: string,
    @Query('duration_min') durationMin: string,
  ): Promise<FareEstimateDto> {
    const d = parseFloat(distanceKm);
    const t = parseFloat(durationMin);
    if (Number.isNaN(d) || Number.isNaN(t) || d < 0 || t < 0) {
      throw new Error('distance_km and duration_min must be non-negative numbers');
    }
    const estimate = await this.goPricingService.estimateFare(
      vehicleType,
      d,
      t,
    );
    return {
      fare: estimate.fare,
      bookingFee: estimate.bookingFee,
      commission: estimate.commission,
      driverPayout: estimate.driverPayout,
      platformTake: estimate.platformTake,
      passengerTotal: estimate.passengerTotal,
      surgeActive: estimate.surgeActive,
      surgeMultiplier: estimate.surgeMultiplier,
      currency: 'MAD',
      breakdown: estimate.breakdown,
    };
  }

  /**
   * Get single fare breakdown for a ride type.
   */
  @Get('breakdown')
  @ApiOperation({ summary: 'Get fare breakdown for a ride type' })
  async breakdown(
    @Query('distance_km') distanceKm: string,
    @Query('duration_min') durationMin: string,
    @Query('ride_type') rideType: string,
    @Query('surge_multiplier') surgeMultiplier?: string,
    @Query('surcharges') surcharges?: string,
    @Query('promo_discount') promoDiscount?: string,
  ) {
    const d = parseFloat(distanceKm);
    const t = parseFloat(durationMin);
    if (Number.isNaN(d) || Number.isNaN(t) || d < 0 || t < 0 || !rideType) {
      return null;
    }
    const surge = surgeMultiplier ? parseFloat(surgeMultiplier) : undefined;
    const surch = surcharges ? parseFloat(surcharges) : undefined;
    const promo = promoDiscount ? parseFloat(promoDiscount) : undefined;
    return this.faresService.getFareBreakdown(
      d,
      t,
      rideType,
      surge,
      surch,
      promo,
    );
  }
}
