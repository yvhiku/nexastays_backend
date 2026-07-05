import { Injectable } from '@nestjs/common';
import { DriversService } from '../drivers/drivers.service';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { PricingService } from '../pricing/pricing.service';

/**
 * MatchingService - Simple distance-based driver matching for MVP
 * In production, this would use more sophisticated algorithms (PostGIS, etc.)
 */
@Injectable()
export class MatchingService {
  constructor(
    private readonly driversService: DriversService,
    private readonly pricingService: PricingService,
  ) {}

  /**
   * Find nearest available driver to pickup location
   * MVP: Simple distance calculation, returns first available driver
   * @param pickupLat Pickup latitude
   * @param pickupLng Pickup longitude
   * @returns Nearest available driver or null
   */
  async findNearestDriver(
    pickupLat: number,
    pickupLng: number,
  ): Promise<DriverProfile | null> {
    const availableDrivers = await this.driversService.getAvailableDrivers(
      pickupLat,
      pickupLng,
    );

    if (availableDrivers.length === 0) {
      return null;
    }

    // MVP: Simple distance-based selection
    // Find driver with minimum distance
    let nearestDriver: DriverProfile | null = null;
    let minDistance = Infinity;

    for (const driver of availableDrivers) {
      if (driver.availability?.latitude && driver.availability?.longitude) {
        const distance = this.pricingService.calculateDistance(
          pickupLat,
          pickupLng,
          driver.availability.latitude,
          driver.availability.longitude,
        );

        if (distance < minDistance) {
          minDistance = distance;
          nearestDriver = driver;
        }
      }
    }

    return nearestDriver;
  }
}
