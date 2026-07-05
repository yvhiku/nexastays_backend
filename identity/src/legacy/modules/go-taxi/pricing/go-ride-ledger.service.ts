import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LedgerAccount } from '../../ledger/entities/ledger-account.entity';
import { EntryType } from '../../ledger/entities/ledger-entry.entity';
import { LedgerService } from '../../ledger/ledger.service';
import { LedgerPostingService } from '../../ledger/ledger-posting.service';
import { Wallet } from '../../wallets/entities/wallet.entity';

const REF_PREFIX = 'GO_RIDE';
const ROUND_EPSILON = 0.02;

@Injectable()
export class GoRideLedgerService {
  private readonly platformWalletId: string | null;

  constructor(
    private readonly ledgerService: LedgerService,
    private readonly ledgerPostingService: LedgerPostingService,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
  ) {
    this.platformWalletId =
      process.env.GO_PLATFORM_WALLET_ID?.trim() || null;
  }

  /**
   * Ensure passenger has at least requiredHold (for fare + booking fee). Throws if insufficient.
   */
  async holdFunds(
    passengerUserId: string,
    requiredHold: number,
    rideId: string,
  ): Promise<void> {
    const wallet = await this.walletRepo.findOne({
      where: { user_id: passengerUserId },
    });
    if (!wallet) {
      throw new NotFoundException('Passenger wallet not found');
    }
    const account =
      await this.ledgerService.getOrCreateWalletAccount(wallet.id);
    const balance = await this.ledgerService.getBalance(account.id);
    if (balance < requiredHold) {
      throw new BadRequestException(
        `Insufficient balance. Required: ${requiredHold} MAD, available: ${balance} MAD`,
      );
    }
  }

  /**
   * Debit passenger and credit platform (booking fee). Call after driver match when passenger confirms.
   */
  async collectBookingFee(
    passengerUserId: string,
    amount: number,
    rideId: string,
  ): Promise<void> {
    if (amount <= 0) return;
    await this.ledgerService.runInLedgerTransaction(async (manager) => {
      const passengerWallet = await manager.getRepository(Wallet).findOne({
        where: { user_id: passengerUserId },
      });
      if (!passengerWallet) {
        throw new NotFoundException('Passenger wallet not found');
      }
      const passengerAccount =
        await this.ledgerService.getOrCreateWalletAccount(
          passengerWallet.id,
          manager,
        );
      const platformAccount = await this.getPlatformAccount(manager);
      await manager
        .getRepository(LedgerAccount)
        .createQueryBuilder('la')
        .where('la.id = :id', { id: passengerAccount.id })
        .setLock('pessimistic_write')
        .getOne();
      const balance = await this.ledgerService.getBalance(
        passengerAccount.id,
        manager,
      );
      if (balance < amount) {
        throw new BadRequestException('Insufficient balance for booking fee');
      }
      const ref = `${REF_PREFIX}_${rideId}_BOOKING_FEE`.slice(0, 64);
      await this.ledgerPostingService.postTwoLegJournal(manager, {
        idempotencyKey: `go_ride:booking_fee:${rideId}`,
        reference: ref,
        description: `Nexa Go booking fee - Ride ${rideId}`,
        debitAccountId: passengerAccount.id,
        creditAccountId: platformAccount.id,
        amount,
        metadata: {
          scheme: 'NEXA_GO',
          kind: 'BOOKING_FEE',
          ride_id: rideId,
        },
      });
    });
  }

  /**
   * Refund passenger (e.g. booking fee on cancellation). Debit platform, credit passenger.
   */
  async refund(
    passengerUserId: string,
    amount: number,
    rideId: string,
    reason: string,
  ): Promise<void> {
    if (amount <= 0) return;
    await this.ledgerService.runInLedgerTransaction(async (manager) => {
      const passengerWallet = await manager.getRepository(Wallet).findOne({
        where: { user_id: passengerUserId },
      });
      if (!passengerWallet) {
        throw new NotFoundException('Passenger wallet not found');
      }
      const passengerAccount =
        await this.ledgerService.getOrCreateWalletAccount(
          passengerWallet.id,
          manager,
        );
      const platformAccount = await this.getPlatformAccount(manager);
      const slug = reason.replace(/\W+/g, '_').slice(0, 48) || 'NA';
      const ref = `${REF_PREFIX}_${rideId}_REFUND_${slug}`.slice(0, 64);
      await this.ledgerPostingService.postTwoLegJournal(manager, {
        idempotencyKey: `go_ride:refund:${rideId}:${slug}`.slice(0, 128),
        reference: ref,
        description: `Nexa Go refund - ${reason} - Ride ${rideId}`,
        debitAccountId: platformAccount.id,
        creditAccountId: passengerAccount.id,
        amount,
        metadata: {
          scheme: 'NEXA_GO',
          kind: 'REFUND',
          ride_id: rideId,
          reason,
        },
      });
    });
  }

  /**
   * Release any hold for this ride (no-op if holds are not persisted).
   */
  async releaseHold(_passengerUserId: string, _rideId: string): Promise<void> {
    // No persistent hold record in v1; balance check at confirm is sufficient.
  }

  /**
   * Charge passenger (e.g. final fare at trip completion). Debit passenger.
   */
  async charge(
    passengerUserId: string,
    amount: number,
    rideId: string,
    description: string,
  ): Promise<void> {
    if (amount <= 0) return;
    await this.ledgerService.runInLedgerTransaction(async (manager) => {
      const passengerWallet = await manager.getRepository(Wallet).findOne({
        where: { user_id: passengerUserId },
      });
      if (!passengerWallet) {
        throw new NotFoundException('Passenger wallet not found');
      }
      const passengerAccount =
        await this.ledgerService.getOrCreateWalletAccount(
          passengerWallet.id,
          manager,
        );
      const platformAccount = await this.getPlatformAccount(manager);
      await manager
        .getRepository(LedgerAccount)
        .createQueryBuilder('la')
        .where('la.id = :id', { id: passengerAccount.id })
        .setLock('pessimistic_write')
        .getOne();
      const balance = await this.ledgerService.getBalance(
        passengerAccount.id,
        manager,
      );
      if (balance < amount) {
        throw new BadRequestException(
          `Insufficient balance for fare. Required: ${amount} MAD`,
        );
      }
      const ref = `${REF_PREFIX}_${rideId}_FARE`.slice(0, 64);
      await this.ledgerPostingService.postTwoLegJournal(manager, {
        idempotencyKey: `go_ride:fare_charge:${rideId}`,
        reference: ref,
        description,
        debitAccountId: passengerAccount.id,
        creditAccountId: platformAccount.id,
        amount,
        metadata: { scheme: 'NEXA_GO', kind: 'FARE_CHARGE', ride_id: rideId },
      });
    });
  }

  /**
   * Settle trip completion: debit passenger (fare), credit driver (driverPayout), credit platform (commission).
   * Booking fee was already collected at confirm.
   */
  async settleCompletion(
    passengerUserId: string,
    driverUserId: string,
    fareAmount: number,
    driverPayout: number,
    commissionAmount: number,
    rideId: string,
  ): Promise<void> {
    if (Math.abs(fareAmount - driverPayout - commissionAmount) > ROUND_EPSILON) {
      throw new BadRequestException(
        'Settlement splits do not sum to fare amount',
      );
    }
    await this.ledgerService.runInLedgerTransaction(async (manager) => {
      const passengerWallet = await manager.getRepository(Wallet).findOne({
        where: { user_id: passengerUserId },
      });
      const driverWallet = await manager.getRepository(Wallet).findOne({
        where: { user_id: driverUserId },
      });
      if (!passengerWallet || !driverWallet) {
        throw new NotFoundException('Passenger or driver wallet not found');
      }
      const passengerAccount =
        await this.ledgerService.getOrCreateWalletAccount(
          passengerWallet.id,
          manager,
        );
      const driverAccount =
        await this.ledgerService.getOrCreateWalletAccount(
          driverWallet.id,
          manager,
        );
      const platformAccount = await this.getPlatformAccount(manager);

      await manager
        .getRepository(LedgerAccount)
        .createQueryBuilder('la')
        .where('la.id = :id', { id: passengerAccount.id })
        .setLock('pessimistic_write')
        .getOne();

      const balance = await this.ledgerService.getBalance(
        passengerAccount.id,
        manager,
      );
      if (balance < fareAmount) {
        throw new BadRequestException(
          `Insufficient balance for fare. Required: ${fareAmount} MAD`,
        );
      }

      const ref = `${REF_PREFIX}_${rideId}_SETTLE`.slice(0, 64);
      const lines =
        commissionAmount > 0
          ? [
              {
                accountId: passengerAccount.id,
                entryType: EntryType.DEBIT,
                amount: fareAmount,
              },
              {
                accountId: driverAccount.id,
                entryType: EntryType.CREDIT,
                amount: driverPayout,
              },
              {
                accountId: platformAccount.id,
                entryType: EntryType.CREDIT,
                amount: commissionAmount,
              },
            ]
          : [
              {
                accountId: passengerAccount.id,
                entryType: EntryType.DEBIT,
                amount: fareAmount,
              },
              {
                accountId: driverAccount.id,
                entryType: EntryType.CREDIT,
                amount: driverPayout,
              },
            ];

      await this.ledgerPostingService.postJournal(manager, {
        idempotencyKey: `go_ride:settle:${rideId}`,
        reference: ref,
        description: `Nexa Go ride settlement - Ride ${rideId}`,
        lines,
        metadata: {
          scheme: 'NEXA_GO',
          kind: 'SETTLEMENT',
          ride_id: rideId,
          fare_amount: fareAmount,
          driver_payout: driverPayout,
          commission_amount: commissionAmount,
        },
      });
    });
  }

  /**
   * Credit a user (e.g. driver payout when using legacy flow). Prefer settleCompletion for full settlement.
   */
  async credit(
    userId: string,
    amount: number,
    rideId: string,
    description: string,
  ): Promise<void> {
    if (amount <= 0) return;
    await this.ledgerService.runInLedgerTransaction(async (manager) => {
      const wallet = await manager.getRepository(Wallet).findOne({
        where: { user_id: userId },
      });
      if (!wallet) {
        throw new NotFoundException('Wallet not found for user');
      }
      const creditAccount =
        await this.ledgerService.getOrCreateWalletAccount(wallet.id, manager);
      const platformAccount = await this.getPlatformAccount(manager);
      const ref = `${REF_PREFIX}_${rideId}_CREDIT`.slice(0, 64);
      await this.ledgerPostingService.postTwoLegJournal(manager, {
        idempotencyKey: `go_ride:credit:${rideId}`,
        reference: ref,
        description,
        debitAccountId: platformAccount.id,
        creditAccountId: creditAccount.id,
        amount,
        metadata: { scheme: 'NEXA_GO', kind: 'CREDIT', ride_id: rideId },
      });
    });
  }

  private async getPlatformAccount(manager?: import('typeorm').EntityManager) {
    if (this.platformWalletId) {
      return this.ledgerService.getOrCreateWalletAccount(
        this.platformWalletId,
        manager,
      );
    }
    return this.ledgerService.getOrCreateSystemAccount(manager, 'FEES');
  }
}
