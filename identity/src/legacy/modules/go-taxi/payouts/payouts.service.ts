import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ride } from '../rides/entities/ride.entity';
import { GoTransaction } from './entities/go-transaction.entity';
import { GoTransactionStatus } from '../enums/go-transaction-status.enum';
import { LedgerPostingService } from '../../ledger/ledger-posting.service';
import { LedgerService } from '../../ledger/ledger.service';
import { EntryType } from '../../ledger/entities/ledger-entry.entity';
import { WalletsService } from '../../wallets/wallets.service';
import { UsersService } from '../../users/users.service';
import { RideStatus } from '../enums/ride-status.enum';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { Wallet } from '../../wallets/entities/wallet.entity';

/**
 * PayoutsService - Handles ride payment processing (atomic DB + ledger postings).
 *
 * CRITICAL: This service NEVER stores balances or manipulates wallets directly.
 * All money postings go through LedgerPostingService (validated journals).
 */
@Injectable()
export class PayoutsService {
  private readonly COMMISSION_RATE = 0.15; // 15% platform commission

  constructor(
    @InjectRepository(Ride)
    private readonly rideRepository: Repository<Ride>,
    @InjectRepository(GoTransaction)
    private readonly goTransactionRepository: Repository<GoTransaction>,
    private readonly ledgerService: LedgerService,
    private readonly walletsService: WalletsService,
    private readonly usersService: UsersService,
    private readonly ledgerPostingService: LedgerPostingService,
  ) {}

  /**
   * Charge ride payment (PRIVATE METHOD - called only by RidesService)
   *
   * This method:
   * 1. Debits rider wallet (final_fare)
   * 2. Credits driver wallet (driver_earnings = final_fare - commission)
   * 3. Credits Nexa commission account (service_fee)
   * 4. Records transaction in go.go_transactions
   *
   * All operations are atomic via LedgerService.runInLedgerTransaction()
   *
   * @param rideId Ride ID to charge
   * @returns GoTransaction record
   */
  async chargeRide(rideId: string): Promise<GoTransaction> {
    const ride = await this.rideRepository.findOne({
      where: { id: rideId },
      relations: ['rider', 'driver', 'driver.user'],
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    if (ride.status !== RideStatus.COMPLETED) {
      throw new BadRequestException(
        'Ride must be completed before charging payment',
      );
    }

    if (!ride.final_fare || ride.final_fare <= 0) {
      throw new BadRequestException('Invalid final fare');
    }

    if (!ride.driver_id) {
      throw new BadRequestException('Ride has no assigned driver');
    }
    // Capture for TS narrowing inside nested callbacks
    const driverId = ride.driver_id;

    // Check if already charged
    const existing = await this.goTransactionRepository.findOne({
      where: { ride_id: rideId },
    });
    if (existing) {
      return existing; // Idempotent - return existing transaction
    }

    const finalFare = ride.final_fare;
    const serviceFee = Math.round(finalFare * this.COMMISSION_RATE * 100) / 100;
    const driverEarnings = Math.round((finalFare - serviceFee) * 100) / 100;

    // Use ledger transaction for atomicity
    return this.ledgerService.runInLedgerTransaction(async (manager) => {
      // Get rider wallet (using manager for transaction consistency)
      const riderWallet = await manager
        .getRepository(Wallet)
        .findOne({ where: { user_id: ride.rider_user_id } });
      if (!riderWallet) {
        throw new NotFoundException('Rider wallet not found');
      }

      // Get driver user_id from driver profile
      const driverProfile = await manager
        .getRepository(DriverProfile)
        .findOne({ where: { id: driverId } });
      if (!driverProfile) {
        throw new NotFoundException('Driver profile not found');
      }

      // Get driver wallet (using manager for transaction consistency)
      const driverWallet = await manager
        .getRepository(Wallet)
        .findOne({ where: { user_id: driverProfile.user_id } });
      if (!driverWallet) {
        throw new NotFoundException('Driver wallet not found');
      }

      // Get or create ledger accounts
      const riderAccount = await this.ledgerService.getOrCreateWalletAccount(
        riderWallet.id,
        manager,
      );
      const driverAccount = await this.ledgerService.getOrCreateWalletAccount(
        driverWallet.id,
        manager,
      );
      const commissionAccount =
        await this.ledgerService.getOrCreateSystemAccount(manager, 'FEES');

      // Check rider balance
      const riderBalance = await this.ledgerService.getBalance(
        riderAccount.id,
        manager,
      );
      if (riderBalance < finalFare) {
        throw new BadRequestException('Insufficient balance');
      }

      const ledgerReference = `GO_RIDE_${rideId}`;
      const ledgerTxn = await this.ledgerPostingService.postJournal(manager, {
        idempotencyKey: `go_taxi:payout_charge:${rideId}`,
        reference: ledgerReference.slice(0, 64),
        description: `Nexa Go ride payment - Ride ${rideId}`,
        lines: [
          {
            accountId: riderAccount.id,
            entryType: EntryType.DEBIT,
            amount: finalFare,
          },
          {
            accountId: driverAccount.id,
            entryType: EntryType.CREDIT,
            amount: driverEarnings,
          },
          {
            accountId: commissionAccount.id,
            entryType: EntryType.CREDIT,
            amount: serviceFee,
          },
        ],
        metadata: {
          scheme: 'NEXA_GO',
          kind: 'RIDE_PAYOUT',
          ride_id: rideId,
          final_fare: finalFare,
          driver_earnings: driverEarnings,
          service_fee: serviceFee,
        },
      });

      // Record in go.go_transactions
      const goTransaction = manager.getRepository(GoTransaction).create({
        ride_id: rideId,
        ledger_transaction_id: ledgerTxn.id,
        service_fee: serviceFee,
        driver_earnings: driverEarnings,
        status: GoTransactionStatus.COMPLETED,
      });

      return manager.getRepository(GoTransaction).save(goTransaction);
    });
  }

  /**
   * Get transaction by ride ID
   */
  async getTransactionByRideId(rideId: string): Promise<GoTransaction | null> {
    return this.goTransactionRepository.findOne({
      where: { ride_id: rideId },
      relations: ['ledger_transaction'],
    });
  }
}
