import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ride } from './entities/ride.entity';
import { RideEvent } from './entities/ride-event.entity';
import { RideStatus } from '../enums/ride-status.enum';
import { PricingService } from '../pricing/pricing.service';
import { MatchingService } from '../matching/matching.service';
import { DriversService } from '../drivers/drivers.service';
import { PayoutsService } from '../payouts/payouts.service';

@Injectable()
export class RidesService {
  constructor(
    @InjectRepository(Ride)
    private readonly rideRepository: Repository<Ride>,
    @InjectRepository(RideEvent)
    private readonly rideEventRepository: Repository<RideEvent>,
    private readonly pricingService: PricingService,
    private readonly matchingService: MatchingService,
    private readonly driversService: DriversService,
    private readonly payoutsService: PayoutsService,
  ) {}

  /**
   * Request a new ride
   */
  async requestRide(
    riderUserId: string,
    pickupLat: number,
    pickupLng: number,
    dropoffLat: number,
    dropoffLng: number,
  ): Promise<Ride> {
    // Calculate distance and estimated fare
    const distance = this.pricingService.calculateDistance(
      pickupLat,
      pickupLng,
      dropoffLat,
      dropoffLng,
    );
    const estimatedTime = this.pricingService.estimateTime(distance);
    const estimatedFare = await this.pricingService.calculateFare(
      distance,
      estimatedTime,
    );

    // Create ride
    const ride = this.rideRepository.create({
      rider_user_id: riderUserId,
      driver_id: null,
      status: RideStatus.REQUESTED,
      pickup_lat: pickupLat,
      pickup_lng: pickupLng,
      dropoff_lat: dropoffLat,
      dropoff_lng: dropoffLng,
      estimated_fare: estimatedFare,
      final_fare: null,
    });

    const savedRide = await this.rideRepository.save(ride);

    // Log event
    await this.createRideEvent(savedRide.id, 'RIDE_REQUESTED', {
      estimated_fare: estimatedFare,
      distance_km: distance,
      estimated_time_minutes: estimatedTime,
    });

    return savedRide;
  }

  /**
   * Get ride by ID
   */
  async getRideById(rideId: string, userId?: string): Promise<Ride> {
    const ride = await this.rideRepository.findOne({
      where: { id: rideId },
      relations: ['rider', 'driver', 'driver.user', 'events'],
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    // Verify user has access (rider or driver)
    if (userId) {
      if (ride.rider_user_id !== userId && ride.driver?.user_id !== userId) {
        throw new ForbiddenException('Access denied to this ride');
      }
    }

    return ride;
  }

  /**
   * Accept ride (driver action)
   */
  async acceptRide(rideId: string, driverId: string): Promise<Ride> {
    const ride = await this.getRideById(rideId);
    const driver = await this.driversService.getDriverById(driverId);

    if (ride.status !== RideStatus.REQUESTED) {
      throw new BadRequestException(
        `Cannot accept ride with status: ${ride.status}`,
      );
    }

    if (ride.driver_id) {
      throw new BadRequestException('Ride already has a driver');
    }

    ride.driver_id = driverId;
    ride.status = RideStatus.ACCEPTED;
    await this.rideRepository.save(ride);

    await this.createRideEvent(rideId, 'RIDE_ACCEPTED', {
      driver_id: driverId,
      driver_name: driver.user.full_name,
    });

    return ride;
  }

  /**
   * Update ride status (arrive, start)
   */
  async updateRideStatus(
    rideId: string,
    status: RideStatus,
    driverId: string,
    metadata?: Record<string, any>,
  ): Promise<Ride> {
    const ride = await this.getRideById(rideId);

    // Verify driver owns this ride
    if (ride.driver_id !== driverId) {
      throw new ForbiddenException('Only assigned driver can update ride');
    }

    // Validate state transitions
    const validTransitions: Record<RideStatus, RideStatus[]> = {
      [RideStatus.REQUESTED]: [RideStatus.ACCEPTED, RideStatus.CANCELLED],
      [RideStatus.ACCEPTED]: [RideStatus.ARRIVED, RideStatus.CANCELLED],
      [RideStatus.ARRIVED]: [RideStatus.STARTED, RideStatus.CANCELLED],
      [RideStatus.STARTED]: [RideStatus.COMPLETED, RideStatus.CANCELLED],
      [RideStatus.COMPLETED]: [],
      [RideStatus.CANCELLED]: [],
    };

    if (!validTransitions[ride.status].includes(status)) {
      throw new BadRequestException(
        `Invalid transition from ${ride.status} to ${status}`,
      );
    }

    ride.status = status;
    await this.rideRepository.save(ride);

    await this.createRideEvent(rideId, `RIDE_${status}`, metadata || {});

    return ride;
  }

  /**
   * Complete ride and trigger payment
   */
  async completeRide(
    rideId: string,
    driverId: string,
    finalDistance?: number,
    finalTime?: number,
  ): Promise<Ride> {
    const ride = await this.getRideById(rideId);

    // Verify driver owns this ride
    if (ride.driver_id !== driverId) {
      throw new ForbiddenException('Only assigned driver can complete ride');
    }

    if (ride.status !== RideStatus.STARTED) {
      throw new BadRequestException(
        `Cannot complete ride with status: ${ride.status}`,
      );
    }

    // Calculate final fare (use provided values or estimate)
    let finalFare = ride.estimated_fare;
    if (finalDistance !== undefined && finalTime !== undefined) {
      finalFare = await this.pricingService.calculateFare(
        finalDistance,
        finalTime,
      );
    }

    ride.final_fare = finalFare;
    ride.status = RideStatus.COMPLETED;
    ride.completed_at = new Date();
    await this.rideRepository.save(ride);

    // Trigger payment (this is the critical step)
    try {
      await this.payoutsService.chargeRide(rideId);
    } catch (error) {
      // Rollback ride completion if payment fails
      ride.status = RideStatus.STARTED;
      ride.final_fare = null;
      ride.completed_at = null;
      await this.rideRepository.save(ride);
      throw error;
    }

    await this.createRideEvent(rideId, 'RIDE_COMPLETED', {
      final_fare: finalFare,
      completed_at: ride.completed_at,
    });

    return ride;
  }

  /**
   * Cancel ride
   */
  async cancelRide(
    rideId: string,
    userId: string,
    reason?: string,
  ): Promise<Ride> {
    const ride = await this.getRideById(rideId);

    // Verify user is rider or driver
    if (ride.rider_user_id !== userId && ride.driver?.user_id !== userId) {
      throw new ForbiddenException('Only rider or driver can cancel ride');
    }

    if (
      ride.status === RideStatus.COMPLETED ||
      ride.status === RideStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot cancel ride with status: ${ride.status}`,
      );
    }

    ride.status = RideStatus.CANCELLED;
    ride.cancel_reason = reason || null;
    await this.rideRepository.save(ride);

    await this.createRideEvent(rideId, 'RIDE_CANCELLED', {
      cancelled_by: userId,
      reason: reason || 'No reason provided',
    });

    return ride;
  }

  /**
   * Get user's ride history
   */
  async getUserRides(userId: string, limit: number = 20): Promise<Ride[]> {
    return this.rideRepository.find({
      where: [{ rider_user_id: userId }, { driver: { user_id: userId } }],
      relations: ['rider', 'driver', 'driver.user'],
      order: { created_at: 'DESC' },
      take: limit,
    });
  }

  /**
   * Create ride event (internal helper)
   */
  private async createRideEvent(
    rideId: string,
    eventType: string,
    payload?: Record<string, any>,
  ): Promise<RideEvent> {
    const event = this.rideEventRepository.create({
      ride_id: rideId,
      event_type: eventType,
      payload: payload || null,
    });
    return this.rideEventRepository.save(event);
  }
}
