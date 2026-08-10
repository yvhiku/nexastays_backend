import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { StaysPaymentIntent } from '../entities/stays-payment-intent.entity';
import { StaysLedgerEntry } from '../entities/stays-ledger-entry.entity';
import { StaysBooking } from '../entities/stays-booking.entity';
import { StaysListing } from '../entities/stays-listing.entity';
import { StaysAuditService } from '../services/stays-audit.service';
import { StaysAvailabilityService } from '../services/stays-availability.service';
import { CmiPaymentProvider } from './cmi-payment.provider';
import { isMockPaymentProvider } from './payment-provider.config';
import type {
  MockPaymentConfirmResult,
  PaymentConfirmationOutcome,
} from './payment-confirmation.types';
import { lockIntentAmount, roundMoney } from '../security/financial-integrity';
import { ConversationProvisionService } from '../../messaging/conversation-provision.service';
import { PRE_CONFIRMATION_BOOKING_STATUSES } from '../services/booking-lifecycle.service';

const NON_PAYABLE_BOOKING_STATUSES = new Set([
  'EXPIRED',
  'CANCELLED_BY_GUEST',
  'CANCELLED_BY_HOST',
  'COMPLETED',
]);

const CONFIRMED_BOOKING_STATUSES = new Set([
  'CONFIRMED',
  'CHECKED_IN',
  'COMPLETED',
]);

export interface CreateIntentResult {
  id: string;
  booking_id: string;
  provider: string;
  provider_intent_id: string | null;
  amount: number;
  currency: string;
  status: string;
  redirect_url?: string;
}

@Injectable()
export class StaysPaymentsService {
  private readonly logger = new Logger(StaysPaymentsService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(StaysPaymentIntent)
    private readonly intentRepo: Repository<StaysPaymentIntent>,
    @InjectRepository(StaysLedgerEntry)
    private readonly ledgerRepo: Repository<StaysLedgerEntry>,
    @InjectRepository(StaysBooking)
    private readonly bookingRepo: Repository<StaysBooking>,
    @InjectRepository(StaysListing)
    private readonly listingRepo: Repository<StaysListing>,
    private readonly auditService: StaysAuditService,
    private readonly availabilityService: StaysAvailabilityService,
    private readonly conversationProvision: ConversationProvisionService,
    private readonly cmiProvider: CmiPaymentProvider,
  ) {}

  async createOrGetIntent(
    bookingId: string,
    guestUserId: string,
    idempotencyKey?: string,
  ): Promise<CreateIntentResult> {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: ['listing'],
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.guest_user_id !== guestUserId) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.status !== 'PAYMENT_PENDING') {
      throw new BadRequestException('Booking is not awaiting payment');
    }

    const available = await this.availabilityService.isListingAvailable(
      booking.listing_id,
      booking.checkin_date,
      booking.checkout_date,
      { excludeBookingId: booking.id },
    );
    if (!available) {
      await this.bookingRepo.update(
        { id: booking.id, status: In(PRE_CONFIRMATION_BOOKING_STATUSES) },
        { status: 'EXPIRED', updated_at: new Date() },
      );
      throw new ConflictException(
        'Selected dates are no longer available. Please try different dates.',
      );
    }

    if (idempotencyKey) {
      const existing = await this.intentRepo.findOne({
        where: { booking_id: bookingId, idempotency_key: idempotencyKey },
      });
      if (existing) {
        return this.toIntentResult(existing);
      }
    }

    const pendingIntent = await this.intentRepo.findOne({
      where: { booking_id: bookingId, status: 'PENDING' },
    });
    if (pendingIntent) {
      if (!idempotencyKey || pendingIntent.idempotency_key === idempotencyKey) {
        return this.toIntentResult(pendingIntent);
      }
      throw new ConflictException(
        'A payment is already in progress for this booking.',
      );
    }

    let totalPaid: number;
    try {
      totalPaid = lockIntentAmount(Number(booking.total_paid ?? 0));
    } catch {
      throw new BadRequestException('Booking total must be greater than zero');
    }
    const currency = booking.currency ?? 'MAD';

    if (isMockPaymentProvider()) {
      const intent = this.intentRepo.create({
        booking_id: bookingId,
        provider: 'mock',
        provider_intent_id: `mock_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        amount: totalPaid,
        currency,
        status: 'PENDING',
        idempotency_key: idempotencyKey ?? null,
      });
      await this.intentRepo.save(intent);
      return this.toIntentResult(intent);
    }

    const cmiOrder = this.cmiProvider.createOrder({
      bookingId,
      amount: totalPaid,
      currency,
      guestUserId,
    });

    const intent = this.intentRepo.create({
      booking_id: bookingId,
      provider: cmiOrder.provider,
      provider_intent_id: cmiOrder.provider_intent_id,
      amount: totalPaid,
      currency,
      status: 'PENDING',
      idempotency_key: idempotencyKey ?? null,
    });
    await this.intentRepo.save(intent);

    return {
      ...this.toIntentResult(intent),
      redirect_url: cmiOrder.redirect_url,
    };
  }

  /**
   * Authenticated mock payment simulation for the booking owner.
   * Uses the same internal confirmation path as provider webhooks.
   */
  async confirmMockPayment(
    bookingId: string,
    guestUserId: string,
  ): Promise<MockPaymentConfirmResult> {
    if (!isMockPaymentProvider()) {
      throw new BadRequestException('Mock payment provider is not enabled');
    }

    const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.guest_user_id !== guestUserId) {
      throw new NotFoundException('Booking not found');
    }

    if (CONFIRMED_BOOKING_STATUSES.has(booking.status)) {
      const succeededIntent = await this.findMockIntentForBooking(
        bookingId,
        'SUCCEEDED',
      );
      if (succeededIntent) {
        return this.toMockConfirmResult(
          'PAYMENT_ALREADY_PROCESSED',
          booking,
          succeededIntent,
        );
      }
      throw new BadRequestException('Booking is not awaiting payment');
    }

    if (NON_PAYABLE_BOOKING_STATUSES.has(booking.status)) {
      throw new BadRequestException(
        `Cannot pay for booking in status ${booking.status}`,
      );
    }

    if (booking.status !== 'PAYMENT_PENDING') {
      throw new BadRequestException('Booking is not awaiting payment');
    }

    const pendingIntent = await this.findMockIntentForBooking(
      bookingId,
      'PENDING',
    );
    if (!pendingIntent) {
      const succeededIntent = await this.findMockIntentForBooking(
        bookingId,
        'SUCCEEDED',
      );
      if (succeededIntent) {
        return this.toMockConfirmResult(
          'PAYMENT_ALREADY_PROCESSED',
          booking,
          succeededIntent,
        );
      }
      throw new NotFoundException('Payment intent not found');
    }

    if (!pendingIntent.provider_intent_id) {
      throw new BadRequestException('Payment intent is invalid');
    }

    let expectedTotal: number;
    try {
      expectedTotal = lockIntentAmount(Number(booking.total_paid ?? 0));
    } catch {
      throw new BadRequestException('Booking total must be greater than zero');
    }
    if (roundMoney(Number(pendingIntent.amount)) !== expectedTotal) {
      throw new BadRequestException(
        'Payment intent amount does not match booking total',
      );
    }

    const outcome = await this.confirmPaymentSuccess(
      'mock',
      pendingIntent.provider_intent_id,
      { source: 'mock_confirm' },
    );

    switch (outcome) {
      case 'CONFIRMED': {
        const refreshedIntent = await this.intentRepo.findOne({
          where: { id: pendingIntent.id },
        });
        const refreshedBooking = await this.bookingRepo.findOne({
          where: { id: bookingId },
        });
        return this.toMockConfirmResult(
          'CONFIRMED',
          refreshedBooking ?? booking,
          refreshedIntent ?? pendingIntent,
        );
      }
      case 'ALREADY_PROCESSED': {
        const refreshedIntent = await this.intentRepo.findOne({
          where: { id: pendingIntent.id },
        });
        return this.toMockConfirmResult(
          'PAYMENT_ALREADY_PROCESSED',
          booking,
          refreshedIntent ?? pendingIntent,
        );
      }
      case 'BOOKING_NOT_PAYABLE':
        throw new BadRequestException('Booking is not awaiting payment');
      case 'DATES_UNAVAILABLE':
        throw new ConflictException(
          'Selected dates are no longer available. Please try different dates.',
        );
      case 'INTENT_NOT_FOUND':
        throw new NotFoundException('Payment intent not found');
      default:
        throw new BadRequestException('Payment could not be confirmed');
    }
  }

  /** Provider webhook entry — lenient (no throw) for external retry semantics. */
  async handleWebhookSuccess(
    provider: string,
    providerIntentId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.confirmPaymentSuccess(provider, providerIntentId, metadata);
  }

  /**
   * Authoritative payment confirmation path shared by mock confirm and provider webhooks.
   */
  async confirmPaymentSuccess(
    provider: string,
    providerIntentId: string,
    metadata?: Record<string, unknown>,
  ): Promise<PaymentConfirmationOutcome> {
    const intent = await this.intentRepo.findOne({
      where: { provider, provider_intent_id: providerIntentId },
    });

    if (!intent) {
      return 'INTENT_NOT_FOUND';
    }

    return this.dataSource.transaction(async (manager) => {
      const intentRepo = manager.getRepository(StaysPaymentIntent);
      const ledgerRepo = manager.getRepository(StaysLedgerEntry);
      const bookingRepo = manager.getRepository(StaysBooking);
      const listingRepo = manager.getRepository(StaysListing);

      const lockedIntent = await intentRepo
        .createQueryBuilder('i')
        .setLock('pessimistic_write')
        .where('i.id = :id', { id: intent.id })
        .getOne();

      if (!lockedIntent || lockedIntent.status === 'SUCCEEDED') {
        return 'ALREADY_PROCESSED';
      }

      const existingLedger = await ledgerRepo.findOne({
        where: {
          booking_id: lockedIntent.booking_id,
          type: 'GUEST_PAYMENT',
          status: 'SETTLED',
        },
      });
      if (existingLedger) {
        await intentRepo.update(
          { id: lockedIntent.id },
          { status: 'SUCCEEDED', updated_at: new Date() },
        );
        return 'ALREADY_PROCESSED';
      }

      const lockedBooking = await bookingRepo
        .createQueryBuilder('b')
        .setLock('pessimistic_write')
        .leftJoinAndSelect('b.listing', 'listing')
        .where('b.id = :id', { id: lockedIntent.booking_id })
        .getOne();

      if (!lockedBooking) {
        return 'BOOKING_NOT_PAYABLE';
      }

      if (lockedBooking.status !== 'PAYMENT_PENDING') {
        if (CONFIRMED_BOOKING_STATUSES.has(lockedBooking.status)) {
          return 'ALREADY_PROCESSED';
        }
        return 'BOOKING_NOT_PAYABLE';
      }

      const booking = lockedBooking;

      // Serialize confirms for the same listing, then re-check overlap
      await listingRepo
        .createQueryBuilder('l')
        .setLock('pessimistic_write')
        .where('l.id = :id', { id: booking.listing_id })
        .getOne();

      const stillAvailable = await this.availabilityService.isListingAvailable(
        booking.listing_id,
        booking.checkin_date,
        booking.checkout_date,
        { excludeBookingId: booking.id, manager },
      );

      if (!stillAvailable) {
        this.logger.error(
          `PAYMENT_REFUND_REQUIRED: payment attempted but dates unavailable for booking ${booking.id}; expiring hold (no REFUND ledger without settled GUEST_PAYMENT)`,
        );
        await intentRepo.update(
          { id: lockedIntent.id },
          { status: 'FAILED', updated_at: new Date() },
        );
        await bookingRepo.update(
          { id: booking.id, status: 'PAYMENT_PENDING' },
          { status: 'EXPIRED', updated_at: new Date() },
        );
        // Financial invariant: do not create a REFUND without a settled GUEST_PAYMENT.
        // Audit/ops alert retains the signal for future provider reconciliation.
        await this.auditService.log({
          entityType: 'BOOKING',
          entityId: booking.id,
          action: 'PAYMENT_REJECTED_DATES_UNAVAILABLE',
          metadata: {
            provider,
            provider_intent_id: providerIntentId,
            refund_amount: Number(lockedIntent.amount),
            alert_key: 'PAYMENT_REFUND_REQUIRED',
            refund_ledger_created: false,
            reason: 'NO_SETTLED_GUEST_PAYMENT',
          },
        });
        return 'DATES_UNAVAILABLE';
      }

      const amount = Number(lockedIntent.amount);
      const guestFee = Number(booking.guest_fee ?? 0);
      const hostFee = Number(booking.host_fee ?? 0);
      const payoutAmount = Number(booking.payout_amount ?? 0);

      await intentRepo.update(
        { id: lockedIntent.id },
        { status: 'SUCCEEDED', updated_at: new Date() },
      );

      const confirmUpdate = await bookingRepo.update(
        { id: booking.id, status: 'PAYMENT_PENDING' },
        {
          status: 'CONFIRMED',
          confirmed_at: new Date(),
          paid_at: new Date(),
          updated_at: new Date(),
        },
      );
      if (!confirmUpdate.affected) {
        return 'BOOKING_NOT_PAYABLE';
      }

      await ledgerRepo.save([
        ledgerRepo.create({
          booking_id: booking.id,
          type: 'GUEST_PAYMENT',
          amount,
          currency: booking.currency,
          status: 'SETTLED',
          metadata: { provider, provider_intent_id: providerIntentId, ...metadata },
        }),
        ledgerRepo.create({
          booking_id: booking.id,
          type: 'PLATFORM_FEE',
          amount: guestFee + hostFee,
          currency: booking.currency,
          status: 'SETTLED',
          metadata: {},
        }),
        ledgerRepo.create({
          booking_id: booking.id,
          type: 'HOST_PAYOUT',
          amount: payoutAmount,
          currency: booking.currency,
          status: 'PENDING',
          metadata: {},
        }),
      ]);

      await this.auditService.log({
        entityType: 'BOOKING',
        entityId: booking.id,
        action: 'PAYMENT_CONFIRMED',
        metadata: {
          provider,
          provider_intent_id: providerIntentId,
          amount,
        },
      });

      await this.conversationProvision.provisionWithinTransaction(
        manager,
        booking,
        booking.listing_id,
        provider,
        providerIntentId,
      );

      return 'CONFIRMED';
    });
  }

  async handleCmiCallback(body: Record<string, unknown>): Promise<void> {
    const result = this.cmiProvider.verifyCallback(body);
    if (!result.valid || !result.providerIntentId) {
      throw new BadRequestException('Invalid CMI callback signature');
    }
    if (result.success) {
      await this.handleWebhookSuccess('cmi', result.providerIntentId, body);
    }
  }

  private async findMockIntentForBooking(
    bookingId: string,
    status: StaysPaymentIntent['status'],
  ): Promise<StaysPaymentIntent | null> {
    return this.intentRepo.findOne({
      where: { booking_id: bookingId, provider: 'mock', status },
      order: { created_at: 'DESC' },
    });
  }

  private toMockConfirmResult(
    status: MockPaymentConfirmResult['status'],
    booking: StaysBooking,
    intent: StaysPaymentIntent,
  ): MockPaymentConfirmResult {
    return {
      status,
      booking_id: booking.id,
      payment_intent_id: intent.id,
      provider_intent_id: intent.provider_intent_id ?? '',
      amount: Number(intent.amount),
      currency: intent.currency,
    };
  }

  private toIntentResult(intent: StaysPaymentIntent): CreateIntentResult {
    return {
      id: intent.id,
      booking_id: intent.booking_id,
      provider: intent.provider,
      provider_intent_id: intent.provider_intent_id,
      amount: Number(intent.amount),
      currency: intent.currency,
      status: intent.status,
    };
  }
}
