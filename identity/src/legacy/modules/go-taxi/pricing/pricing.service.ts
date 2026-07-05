import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PricingRule, ServiceType } from '../entities/pricing-rule.entity';

/**
 * PricingService - Configurable fare calculation from database rules
 * Formula: (base_fare + (distance × per_km) + (time × per_min) + (waiting × wait_rate)) × surge_multiplier
 */
@Injectable()
export class PricingService {
  // Default fallback values (used if database rule not found)
  private readonly DEFAULT_BASE_FARE = 10.0;
  private readonly DEFAULT_PER_KM = 2.0;
  private readonly DEFAULT_PER_MIN = 0.5;
  private readonly DEFAULT_WAIT_RATE = 0.3;
  private readonly DEFAULT_SURGE = 1.0;

  constructor(
    @InjectRepository(PricingRule)
    private readonly pricingRuleRepository: Repository<PricingRule>,
  ) {}

  /**
   * Get active pricing rule for a service type
   */
  private async getActivePricingRule(
    serviceType: ServiceType,
  ): Promise<PricingRule | null> {
    return this.pricingRuleRepository.findOne({
      where: {
        service_type: serviceType,
        active: true,
      },
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Calculate fare based on distance, time, and optional waiting time
   * @param distanceKm Distance in kilometers
   * @param timeMinutes Estimated time in minutes
   * @param waitingMinutes Optional waiting time in minutes
   * @param surgeMultiplier Optional surge multiplier (defaults to rule value or 1.0)
   * @param serviceType Service type (RIDE or DELIVERY)
   * @returns Calculated fare in MAD
   */
  async calculateFare(
    distanceKm: number,
    timeMinutes: number,
    waitingMinutes: number = 0,
    surgeMultiplier?: number,
    serviceType: ServiceType = ServiceType.RIDE,
  ): Promise<number> {
    if (distanceKm < 0 || timeMinutes < 0 || waitingMinutes < 0) {
      throw new Error('Distance, time, and waiting time must be non-negative');
    }

    const rule = await this.getActivePricingRule(serviceType);
    const baseFare = rule ? Number(rule.base_fare) : this.DEFAULT_BASE_FARE;
    const perKm = rule ? Number(rule.per_km) : this.DEFAULT_PER_KM;
    const perMin = rule ? Number(rule.per_min) : this.DEFAULT_PER_MIN;
    const waitRate = rule
      ? Number(rule.wait_rate ?? this.DEFAULT_WAIT_RATE)
      : this.DEFAULT_WAIT_RATE;
    const surge =
      surgeMultiplier ??
      (rule ? Number(rule.surge_multiplier) : this.DEFAULT_SURGE);

    const fare =
      (baseFare +
        distanceKm * perKm +
        timeMinutes * perMin +
        waitingMinutes * waitRate) *
      surge;

    // Round to 2 decimal places
    return Math.round(fare * 100) / 100;
  }

  /**
   * Calculate fare with detailed breakdown
   * @returns Object with fare components and total
   */
  async calculateFareBreakdown(
    distanceKm: number,
    timeMinutes: number,
    waitingMinutes: number = 0,
    surgeMultiplier?: number,
    serviceType: ServiceType = ServiceType.RIDE,
  ): Promise<{
    base_fare: number;
    distance_fare: number;
    time_fare: number;
    waiting_fare: number;
    subtotal: number;
    surge_multiplier: number;
    total_fare: number;
  }> {
    const rule = await this.getActivePricingRule(serviceType);
    const baseFare = rule ? Number(rule.base_fare) : this.DEFAULT_BASE_FARE;
    const perKm = rule ? Number(rule.per_km) : this.DEFAULT_PER_KM;
    const perMin = rule ? Number(rule.per_min) : this.DEFAULT_PER_MIN;
    const waitRate = rule
      ? Number(rule.wait_rate ?? this.DEFAULT_WAIT_RATE)
      : this.DEFAULT_WAIT_RATE;
    const surge =
      surgeMultiplier ??
      (rule ? Number(rule.surge_multiplier) : this.DEFAULT_SURGE);

    const distanceFare = distanceKm * perKm;
    const timeFare = timeMinutes * perMin;
    const waitingFare = waitingMinutes * waitRate;
    const subtotal = baseFare + distanceFare + timeFare + waitingFare;
    const totalFare = subtotal * surge;

    return {
      base_fare: Math.round(baseFare * 100) / 100,
      distance_fare: Math.round(distanceFare * 100) / 100,
      time_fare: Math.round(timeFare * 100) / 100,
      waiting_fare: Math.round(waitingFare * 100) / 100,
      subtotal: Math.round(subtotal * 100) / 100,
      surge_multiplier: surge,
      total_fare: Math.round(totalFare * 100) / 100,
    };
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   * @param lat1 Latitude of point 1
   * @param lng1 Longitude of point 1
   * @param lat2 Latitude of point 2
   * @param lng2 Longitude of point 2
   * @returns Distance in kilometers
   */
  calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Estimate ride time based on distance (simple MVP calculation)
   * Assumes average speed of 30 km/h in urban areas
   * @param distanceKm Distance in kilometers
   * @returns Estimated time in minutes
   */
  estimateTime(distanceKm: number): number {
    const AVERAGE_SPEED_KMH = 30; // km/h
    const timeHours = distanceKm / AVERAGE_SPEED_KMH;
    const timeMinutes = timeHours * 60;
    return Math.ceil(timeMinutes); // Round up to nearest minute
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
