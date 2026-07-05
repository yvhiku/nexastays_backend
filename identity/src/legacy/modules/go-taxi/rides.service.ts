import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { IsNull, Repository } from 'typeorm';
import { getBalanceCacheKey } from '../../common/cache/http-cache.interceptor';
import { Ride, type RideStatus } from './entities/ride.entity';
import { User } from '../users/entities/user.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { LedgerPostingService } from '../ledger/ledger-posting.service';
import { EntryType } from '../ledger/entities/ledger-entry.entity';
import { LedgerAccount } from '../ledger/entities/ledger-account.entity';
import { LedgerService } from '../ledger/ledger.service';
import { WalletsService } from '../wallets/wallets.service';
import { AppTransaction } from '../transactions/entities/app-transaction.entity';
import { CreateRideDto } from './dto/create-ride.dto';
import { CommissionService } from './commissions/commissions.service';
import { FaresService } from './fares/fares.service';
import { PricingService } from './pricing/pricing.service';
import { GoPricingService } from './pricing/go-pricing.service';
import { GoRideLedgerService } from './pricing/go-ride-ledger.service';
import { CancellationService } from './rides/cancellation.service';

@Injectable()
export class RidesService {
  constructor(
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(AppTransaction)
    private readonly appTxRepo: Repository<AppTransaction>,
    private readonly ledgerService: LedgerService,
    private readonly ledgerPostingService: LedgerPostingService,
    private readonly walletsService: WalletsService,
    private readonly commissionService: CommissionService,
    private readonly faresService: FaresService,
    private readonly pricingService: PricingService,
    private readonly goPricingService: GoPricingService,
    private readonly rideLedger: GoRideLedgerService,
    private readonly cancellationService: CancellationService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async create(riderUserId: string, dto: CreateRideDto) {
    const rider = await this.userRepo.findOne({
      where: { id: riderUserId },
      select: ['id', 'account_type'],
    });
    if (!rider) {
      throw new NotFoundException('User not found');
    }
    if (rider.account_type !== 'CONSUMER') {
      throw new ForbiddenException('Only CONSUMER accounts can request rides');
    }
    const riderWallet = await this.walletRepo.findOne({
      where: { user_id: riderUserId },
    });
    if (!riderWallet) {
      throw new BadRequestException('Rider wallet not found');
    }
    const riderAccount = await this.ledgerService.getOrCreateWalletAccount(
      riderWallet.id,
    );
    const balance = await this.ledgerService.getBalance(riderAccount.id);

    // Config-driven pricing when ride_type + route data provided
    let fare = Number(dto.fare_amount);
    let vehicleType: string | null = dto.ride_type ?? null;
    let estimateSnapshot: Record<string, unknown> | null = null;

    if (dto.ride_type && (dto.distance_km != null || dto.pickup_lat != null)) {
      let distanceKm = dto.distance_km;
      let durationMin = dto.duration_min;
      if (distanceKm == null && dto.pickup_lat != null && dto.dropoff_lat != null) {
        distanceKm = this.goPricingService.calculateDistance(
          dto.pickup_lat,
          dto.pickup_lng!,
          dto.dropoff_lat,
          dto.dropoff_lng!,
        );
        durationMin ??= this.goPricingService.estimateTime(distanceKm);
      }
      if (distanceKm != null && durationMin != null) {
        const estimate = await this.goPricingService.estimateFare(
          dto.ride_type,
          distanceKm,
          durationMin,
        );
        const expected = estimate.passengerTotal;
        if (Math.abs(fare - expected) > 2) {
          throw new BadRequestException(
            `Fare mismatch. Expected ${expected} MAD for ${dto.ride_type}. Got ${fare} MAD.`,
          );
        }
        fare = expected;
        vehicleType = dto.ride_type;
        estimateSnapshot = {
          ...estimate,
          currency: 'MAD',
        };
        await this.rideLedger.holdFunds(
          riderUserId,
          estimate.passengerTotal,
          `create-${riderUserId}-${Date.now()}`,
        );
      }
    }

    if (balance < fare) {
      throw new BadRequestException(
        `Insufficient balance. Required: ${fare} MAD, available: ${balance} MAD`,
      );
    }
    const ride = await this.rideRepo.save({
      rider_user_id: riderUserId,
      driver_user_id: null,
      status: 'REQUESTED',
      fare_amount: fare,
      currency: 'MAD',
      ride_type: vehicleType,
      vehicle_type: vehicleType,
      fare_estimate: estimateSnapshot,
      pickup_location: dto.pickup_location ?? null,
      dropoff_location: dto.dropoff_location ?? null,
      pickup_lat: dto.pickup_lat ?? null,
      pickup_lng: dto.pickup_lng ?? null,
    });
    return this.toResponse(ride);
  }

  async accept(rideId: string, driverUserId: string) {
    const ride = await this.rideRepo.findOne({
      where: { id: rideId },
      relations: ['rider_user', 'driver_user'],
    });
    if (!ride) {
      throw new NotFoundException('Ride not found');
    }
    if (ride.status !== 'REQUESTED') {
      throw new BadRequestException(
        `Ride cannot be accepted. Status: ${ride.status}`,
      );
    }
    const driver = await this.userRepo.findOne({
      where: { id: driverUserId },
      select: ['id', 'account_type'],
    });
    if (!driver || driver.account_type !== 'DRIVER') {
      throw new ForbiddenException('Only DRIVER accounts can accept rides');
    }

    ride.driver_user_id = driverUserId;
    ride.status = 'ACCEPTED';
    ride.accepted_at = new Date();

    const existingEstimate = ride.fare_estimate as { passengerTotal?: number; bookingFee?: number } | null;
    if (existingEstimate?.passengerTotal != null && existingEstimate?.bookingFee != null) {
      await this.rideLedger.holdFunds(
        ride.rider_user_id,
        existingEstimate.passengerTotal,
        rideId,
      );
      await this.rideLedger.collectBookingFee(
        ride.rider_user_id,
        existingEstimate.bookingFee,
        rideId,
      );
      ride.booking_fee = existingEstimate.bookingFee;
    }

    await this.rideRepo.save(ride);
    return this.toResponse(ride);
  }

  async arrive(rideId: string, driverUserId: string) {
    const ride = await this.rideRepo.findOne({
      where: { id: rideId },
      relations: ['rider_user', 'driver_user'],
    });
    if (!ride) {
      throw new NotFoundException('Ride not found');
    }
    if (ride.status !== 'ACCEPTED') {
      throw new BadRequestException(
        `Ride cannot be marked as arrived. Status: ${ride.status}`,
      );
    }
    if (ride.driver_user_id !== driverUserId) {
      throw new ForbiddenException('Only the assigned driver can mark arrival');
    }
    ride.status = 'ARRIVED';
    await this.rideRepo.save(ride);
    return this.toResponse(ride);
  }

  async start(rideId: string, driverUserId: string) {
    const ride = await this.rideRepo.findOne({
      where: { id: rideId },
      relations: ['rider_user', 'driver_user'],
    });
    if (!ride) {
      throw new NotFoundException('Ride not found');
    }
    if (ride.status !== 'ARRIVED') {
      throw new BadRequestException(
        `Ride cannot be started. Status: ${ride.status}. Driver must arrive first.`,
      );
    }
    if (ride.driver_user_id !== driverUserId) {
      throw new ForbiddenException(
        'Only the assigned driver can start the ride',
      );
    }
    ride.status = 'IN_PROGRESS'; // Client in car, trip started
    await this.rideRepo.save(ride);
    return this.toResponse(ride);
  }

  async complete(
    rideId: string,
    driverUserId: string,
    finalDistanceKm?: number,
    finalDurationMin?: number,
  ) {
    const ride = await this.rideRepo.findOne({
      where: { id: rideId },
      relations: ['rider_user', 'driver_user'],
    });
    if (!ride) {
      throw new NotFoundException('Ride not found');
    }
    if (ride.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        `Ride cannot be completed. Status: ${ride.status}. Ride must be IN_PROGRESS (trip started).`,
      );
    }
    if (ride.driver_user_id !== driverUserId) {
      throw new ForbiddenException(
        'Only the assigned driver can complete this ride',
      );
    }

    const vehicleType = ride.vehicle_type ?? ride.ride_type;
    const useConfigPricing =
      vehicleType &&
      finalDistanceKm != null &&
      finalDurationMin != null;

    if (useConfigPricing) {
      const finalFare = await this.goPricingService.getFinalFare(
        vehicleType,
        finalDistanceKm,
        finalDurationMin,
      );
      await this.rideLedger.settleCompletion(
        ride.rider_user_id,
        driverUserId,
        finalFare.fare,
        finalFare.driverPayout,
        finalFare.commission,
        rideId,
      );
      ride.fare_final = finalFare.fare;
      ride.commission = finalFare.commission;
      ride.driver_payout = finalFare.driverPayout;
      ride.platform_take = finalFare.platformTake;
      ride.passenger_total = finalFare.fare + Number(ride.booking_fee ?? 0);
      ride.surge_multiplier = finalFare.surgeMultiplier;
      ride.surge_active = finalFare.surgeActive;
    } else {
      const fare = Number(ride.fare_amount);
      let commission: number;
      let driverAmount: number;
      let commissionRate: number | null = null;

      if (ride.ride_type) {
        const breakdown = await this.faresService.getFareBreakdown(
          0,
          0,
          ride.ride_type,
        );
        commission = breakdown.fixedCommission;
        driverAmount = fare - commission;
      } else {
        const commissionMetadata =
          await this.commissionService.getRideCommissionMetadata(fare);
        commission = commissionMetadata.commission_amount;
        driverAmount = commissionMetadata.driver_earnings;
        commissionRate = commissionMetadata.commission_rate;
      }

      const riderWallet = await this.walletRepo.findOne({
        where: { user_id: ride.rider_user_id },
      });
      if (!riderWallet) {
        throw new BadRequestException('Rider wallet not found');
      }
      const driverWallet = await this.walletsService.ensureWalletForUserId(
        ride.driver_user_id,
      );

      await this.ledgerService.runInLedgerTransaction(async (manager) => {
        const riderAccount = await this.ledgerService.getOrCreateWalletAccount(
          riderWallet.id,
          manager,
        );
        const driverAccount = await this.ledgerService.getOrCreateWalletAccount(
          driverWallet.id,
          manager,
        );
        const feesAccount = await this.ledgerService.getOrCreateSystemAccount(
          manager,
          'FEES',
        );

        await manager
          .getRepository(LedgerAccount)
          .createQueryBuilder('la')
          .where('la.id = :id', { id: riderAccount.id })
          .setLock('pessimistic_write')
          .getOne();

        const balance = await this.ledgerService.getBalance(
          riderAccount.id,
          manager,
        );
        if (balance < fare) {
          throw new BadRequestException(
            `Insufficient rider balance. Required: ${fare} MAD, available: ${balance} MAD`,
          );
        }

        const ref = `RIDE-${rideId}-${Date.now()}`.slice(0, 64);
        if (Math.abs(fare - driverAmount - commission) > 0.02) {
          throw new BadRequestException('Fare split does not balance');
        }
        const lines =
          commission > 0
            ? [
                {
                  accountId: riderAccount.id,
                  entryType: EntryType.DEBIT,
                  amount: fare,
                },
                {
                  accountId: driverAccount.id,
                  entryType: EntryType.CREDIT,
                  amount: driverAmount,
                },
                {
                  accountId: feesAccount.id,
                  entryType: EntryType.CREDIT,
                  amount: commission,
                },
              ]
            : [
                {
                  accountId: riderAccount.id,
                  entryType: EntryType.DEBIT,
                  amount: fare,
                },
                {
                  accountId: driverAccount.id,
                  entryType: EntryType.CREDIT,
                  amount: driverAmount,
                },
              ];

        const ledgerTxn = await this.ledgerPostingService.postJournal(
          manager,
          {
            idempotencyKey: `go_ride:legacy_complete:${rideId}`,
            reference: ref,
            description: `Nexa Go ride fare completion - Ride ${rideId}`,
            metadata: {
              service: 'GO_RIDE',
              ride_id: rideId,
              fare,
              commission_rate: commissionRate,
              commission_amount: commission,
              driver_earnings: driverAmount,
              path: 'legacy_fare_completion',
            },
            lines,
          },
        );

        const appTxReference = `TAXI-${rideId}-${Date.now()}`;
        await manager.getRepository(AppTransaction).save({
          sender_user_id: ride.rider_user_id,
          receiver_user_id: ride.driver_user_id,
          amount: fare,
          type: 'TAXI_RIDE',
          status: 'COMPLETED',
          reference: appTxReference,
          ledger_transaction_id: ledgerTxn.id,
        });
      });

      ride.fare_final = fare;
      ride.commission = commission;
      ride.driver_payout = driverAmount;
      ride.platform_take = (ride.booking_fee != null ? Number(ride.booking_fee) : 0) + commission;
      ride.passenger_total = fare + (ride.booking_fee != null ? Number(ride.booking_fee) : 0);
    }

    ride.status = 'COMPLETED';
    ride.completed_at = new Date();
    await this.rideRepo.save(ride);

    // Invalidate balance cache so rider and driver see updated balance in the app
    try {
      await this.cacheManager.del(getBalanceCacheKey(ride.rider_user_id));
      if (ride.driver_user_id) {
        await this.cacheManager.del(getBalanceCacheKey(ride.driver_user_id));
      }
    } catch {
      // non-fatal
    }

    return this.toResponse(ride);
  }

  async list(
    accountType: string,
    userId: string,
    status?: string,
  ): Promise<any[]> {
    const qb = this.rideRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.rider_user', 'ru')
      .leftJoinAndSelect('r.driver_user', 'du')
      .orderBy('r.created_at', 'DESC');

    if (accountType === 'CONSUMER') {
      qb.andWhere('r.rider_user_id = :userId', { userId });
      if (status && status !== 'all') {
        qb.andWhere('r.status = :status', { status });
      }
    } else if (accountType === 'DRIVER') {
      // For drivers:
      // - If status is REQUESTED, show all unassigned REQUESTED rides (driver_user_id IS NULL)
      // - If status is specified and not REQUESTED, show rides assigned to this driver with that status
      // - If no status filter, show both: unassigned REQUESTED rides AND rides assigned to this driver
      if (status === 'REQUESTED') {
        qb.andWhere('r.driver_user_id IS NULL');
        qb.andWhere('r.status = :status', { status });
      } else if (status && status !== 'all') {
        // For specific statuses other than REQUESTED, show rides assigned to this driver
        qb.andWhere('r.driver_user_id = :userId', { userId });
        qb.andWhere('r.status = :status', { status });
      } else {
        // No status filter: show unassigned REQUESTED rides OR rides assigned to this driver
        qb.andWhere(
          '(r.driver_user_id IS NULL AND r.status = :requestedStatus) OR (r.driver_user_id = :userId)',
          { requestedStatus: 'REQUESTED', userId },
        );
      }
    } else {
      // For other account types (ADMIN, etc.), apply status filter if provided
      if (status && status !== 'all') {
        qb.andWhere('r.status = :status', { status });
      }
    }

    const rides = await qb.getMany();
    return rides.map((r) => this.toResponse(r));
  }

  /**
   * Unassigned REQUESTED rides for driver app.
   * When lat, lng, radiusKm are provided, returns only rides whose pickup is within radius (default 1 km).
   */
  async listAvailableForDriver(
    driverLat?: number,
    driverLng?: number,
    radiusKm: number = 1,
  ): Promise<any[]> {
    const rides = await this.rideRepo.find({
      where: { status: 'REQUESTED' as RideStatus, driver_user_id: IsNull() },
      relations: ['rider_user'],
      order: { created_at: 'DESC' },
    });

    if (driverLat != null && driverLng != null && radiusKm > 0) {
      const filtered = rides.filter((r) => {
        const lat = r.pickup_lat != null ? Number(r.pickup_lat) : null;
        const lng = r.pickup_lng != null ? Number(r.pickup_lng) : null;
        if (lat == null || lng == null) return false;
        const distance = this.pricingService.calculateDistance(
          driverLat,
          driverLng,
          lat,
          lng,
        );
        return distance <= radiusKm;
      });
      return filtered.map((r) => this.toResponse(r));
    }

    return rides.map((r) => this.toResponse(r));
  }

  async getOne(rideId: string) {
    const ride = await this.rideRepo.findOne({
      where: { id: rideId },
      relations: ['rider_user', 'driver_user'],
    });
    if (!ride) {
      throw new NotFoundException('Ride not found');
    }
    return this.toResponse(ride);
  }

  async cancel(
    rideId: string,
    userId: string,
    accountType: string,
    reason?: string,
  ) {
    const ride = await this.rideRepo.findOne({
      where: { id: rideId },
    });
    if (!ride) {
      throw new NotFoundException('Ride not found');
    }
    if (ride.rider_user_id !== userId && ride.driver_user_id !== userId) {
      throw new ForbiddenException('Only rider or driver can cancel this ride');
    }
    const cancelledBy: 'passenger' | 'driver' =
      ride.rider_user_id === userId ? 'passenger' : 'driver';
    const cancelled = await this.cancellationService.cancelRide(
      rideId,
      cancelledBy,
      reason ?? 'No reason provided',
    );
    return this.toResponse(cancelled);
  }

  private toResponse(ride: Ride) {
    const r = ride as Ride & { rider_user?: User; driver_user?: User | null };
    return {
      id: ride.id,
      rider_user_id: ride.rider_user_id,
      passenger_id: ride.rider_user_id,
      passenger_name:
        r.rider_user?.full_name ?? r.rider_user?.phone_number ?? null,
      driver_user_id: ride.driver_user_id,
      driver_id: ride.driver_user_id ?? null,
      driver_name:
        r.driver_user?.full_name ?? r.driver_user?.phone_number ?? null,
      status: ride.status,
      fare_amount: Number(ride.fare_amount),
      fare: Number(ride.fare_amount),
      currency: ride.currency,
      pickup_location: ride.pickup_location ?? null,
      pickup_lat: ride.pickup_lat != null ? Number(ride.pickup_lat) : null,
      pickup_lng: ride.pickup_lng != null ? Number(ride.pickup_lng) : null,
      dropoff_location: ride.dropoff_location ?? null,
      created_at: ride.created_at,
      updated_at: ride.updated_at,
      completed_at: ride.completed_at ?? null,
    };
  }
}
