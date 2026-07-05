import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Repository } from 'typeorm';
import { GoPricingConfig } from './entities/go-pricing-config.entity';
import type { FareEstimate } from './dto/fare-estimate.dto';

const CACHE_KEY_PREFIX = 'go_pricing_config:';
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface PricingConfigDto {
  vehicleType: string;
  baseFare: number;
  perKmRate: number;
  perMinRate: number;
  minFare: number;
  bookingFee: number;
  commissionType: string;
  commissionRate: number;
  commissionMin: number;
  cancellationWindowSecs: number;
  cancellationFee: number;
  surgeMultiplier: number;
  surgeActive: boolean;
}

/**
 * Single source of truth for Nexa Go fare and payout calculations.
 * All fare computation must go through this service; no direct calculation elsewhere.
 */
@Injectable()
export class GoPricingService {
  private readonly cacheTtlMs: number;

  constructor(
    @InjectRepository(GoPricingConfig)
    private readonly configRepo: Repository<GoPricingConfig>,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {
    const ttlSec = process.env.GO_PRICING_CACHE_TTL_SECONDS;
    this.cacheTtlMs =
      ttlSec != null && ttlSec !== ''
        ? Math.max(1000, parseInt(ttlSec, 10) * 1000)
        : DEFAULT_CACHE_TTL_MS;
  }

  /**
   * Get pricing config for a vehicle type. Cached with TTL (default 5 min).
   */
  async getPricingConfig(vehicleType: string): Promise<PricingConfigDto> {
    const key = CACHE_KEY_PREFIX + vehicleType.toLowerCase();
    const cached = await this.cache.get<PricingConfigDto>(key);
    if (cached) {
      return cached;
    }
    const row = await this.configRepo.findOne({
      where: {
        vehicle_type: vehicleType.toLowerCase(),
        is_active: true,
      },
    });
    if (!row) {
      throw new NotFoundException(
        `Pricing config not found for vehicle type: ${vehicleType}`,
      );
    }
    const dto = this.toConfigDto(row);
    await this.cache.set(key, dto, this.cacheTtlMs);
    return dto;
  }

  /**
   * Estimate fare (for display at booking). Uses estimated distance/duration.
   */
  async estimateFare(
    vehicleType: string,
    distanceKm: number,
    durationMin: number,
  ): Promise<FareEstimate> {
    const config = await this.getPricingConfig(vehicleType);
    return this.computeFare(config, distanceKm, durationMin);
  }

  /**
   * Final fare at trip completion. Always use actual distance and duration for settlement.
   */
  async getFinalFare(
    vehicleType: string,
    actualDistanceKm: number,
    actualDurationMin: number,
  ): Promise<FareEstimate> {
    const config = await this.getPricingConfig(vehicleType);
    return this.computeFare(config, actualDistanceKm, actualDurationMin);
  }

  private computeFare(
    config: PricingConfigDto,
    distanceKm: number,
    durationMin: number,
  ): FareEstimate {
    const baseFare = Number(config.baseFare);
    const perKmRate = Number(config.perKmRate);
    const perMinRate = Number(config.perMinRate);
    const minFare = Number(config.minFare);
    const bookingFee = Number(config.bookingFee);
    const commissionRate = Number(config.commissionRate ?? 0);
    const commissionMin = Number(config.commissionMin);
    const surgeMultiplier = Number(config.surgeMultiplier);
    const surgeActive = Boolean(config.surgeActive);

    const distanceComponent = this.round2(distanceKm * perKmRate);
    const timeComponent = this.round2(durationMin * perMinRate);
    const rawFare = baseFare + distanceComponent + timeComponent;
    const fare = this.round2(Math.max(rawFare, minFare));
    const minFareApplied = rawFare < minFare;

    const surgedFare = surgeActive
      ? this.round2(fare * surgeMultiplier)
      : fare;

    const rawCommission = surgedFare * commissionRate;
    const commission = this.round2(
      Math.max(rawCommission, commissionMin),
    );

    const driverPayout = this.round2(surgedFare - commission);
    const platformTake = this.round2(bookingFee + commission);
    const passengerTotal = this.round2(surgedFare + bookingFee);

    return {
      fare: surgedFare,
      bookingFee,
      commission,
      driverPayout,
      platformTake,
      passengerTotal,
      surgeMultiplier,
      surgeActive,
      breakdown: {
        baseFare,
        distanceComponent,
        timeComponent,
        minFareApplied,
      },
    };
  }

  /**
   * Haversine distance in km (for estimate when no route available).
   */
  calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371;
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return this.round2(R * c);
  }

  /**
   * Simple time estimate from distance (e.g. 30 km/h urban).
   */
  estimateTime(distanceKm: number): number {
    const AVERAGE_SPEED_KMH = 30;
    return Math.ceil((distanceKm / AVERAGE_SPEED_KMH) * 60);
  }

  /** Invalidate cache for a vehicle type (e.g. after admin PATCH). */
  async invalidateConfigCache(vehicleType: string): Promise<void> {
    await this.cache.del(CACHE_KEY_PREFIX + vehicleType.toLowerCase());
  }

  private toConfigDto(row: GoPricingConfig): PricingConfigDto {
    return {
      vehicleType: row.vehicle_type,
      baseFare: Number(row.base_fare),
      perKmRate: Number(row.per_km_rate),
      perMinRate: Number(row.per_min_rate),
      minFare: Number(row.min_fare),
      bookingFee: Number(row.booking_fee),
      commissionType: row.commission_type,
      commissionRate: Number(row.commission_rate ?? 0),
      commissionMin: Number(row.commission_min),
      cancellationWindowSecs: row.cancellation_window_secs,
      cancellationFee: Number(row.cancellation_fee),
      surgeMultiplier: Number(row.surge_multiplier),
      surgeActive: row.surge_active,
    };
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
