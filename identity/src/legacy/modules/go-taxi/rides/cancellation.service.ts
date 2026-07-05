import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ride } from '../entities/ride.entity';
import { GoPricingService } from '../pricing/go-pricing.service';
import { GoRideLedgerService } from '../pricing/go-ride-ledger.service';

export type CancelledBy = 'passenger' | 'driver' | 'system';

@Injectable()
export class CancellationService {
  constructor(
    @InjectRepository(Ride)
    private readonly rideRepository: Repository<Ride>,
    private readonly pricingService: GoPricingService,
    private readonly rideLedger: GoRideLedgerService,
  ) {}

  /**
   * Single entry point for all ride cancellations. Handles refunds and fees per spec.
   */
  async cancelRide(
    rideId: string,
    cancelledBy: CancelledBy,
    reason: string,
  ): Promise<Ride> {
    const ride = await this.rideRepository.findOne({
      where: { id: rideId },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    if (ride.status === 'COMPLETED' || ride.status === 'CANCELLED') {
      throw new BadRequestException(
        `Ride cannot be cancelled. Status: ${ride.status}`,
      );
    }

    const passengerId = ride.rider_user_id;
    const now = new Date();
    const acceptedAt = ride.accepted_at;
    const secondsSinceAcceptance =
      acceptedAt != null
        ? (now.getTime() - new Date(acceptedAt).getTime()) / 1000
        : 0;

    const vehicleType = ride.vehicle_type ?? 'economy';
    const config = await this.pricingService.getPricingConfig(vehicleType);
    const withinWindow =
      secondsSinceAcceptance <= config.cancellationWindowSecs;
    const bookingFee = Number(ride.booking_fee ?? 0);

    if (cancelledBy === 'passenger') {
      if (withinWindow) {
        if (bookingFee > 0) {
          await this.rideLedger.refund(
            passengerId,
            bookingFee,
            rideId,
            'CANCELLATION_WITHIN_WINDOW',
          );
        }
        ride.cancellation_fee = 0;
        ride.cancellation_fee_collected = false;
      } else {
        ride.cancellation_fee = config.cancellationFee;
        ride.cancellation_fee_collected = true;
      }
    }

    if (cancelledBy === 'driver') {
      if (bookingFee > 0) {
        await this.rideLedger.refund(
          passengerId,
          bookingFee,
          rideId,
          'DRIVER_CANCELLED',
        );
      }
      ride.cancellation_fee = 0;
      ride.cancellation_fee_collected = false;
    }

    if (cancelledBy === 'system') {
      if (bookingFee > 0) {
        await this.rideLedger.refund(
          passengerId,
          bookingFee,
          rideId,
          'NO_DRIVER_FOUND',
        );
      }
      ride.cancellation_fee = 0;
    }

    ride.status = 'CANCELLED';
    ride.cancelled_by = cancelledBy;
    ride.cancellation_reason = reason;
    ride.cancelled_at = now;

    await this.rideRepository.save(ride);
    await this.rideLedger.releaseHold(passengerId, rideId);

    return ride;
  }
}
