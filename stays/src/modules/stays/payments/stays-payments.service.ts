import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StaysPaymentIntent } from '../entities/stays-payment-intent.entity';
import { StaysLedgerEntry } from '../entities/stays-ledger-entry.entity';
import { StaysBooking } from '../entities/stays-booking.entity';
import { StaysListing } from '../entities/stays-listing.entity';
import { StaysAuditService } from '../services/stays-audit.service';
import { StaysAvailabilityService } from '../services/stays-availability.service';
import { DomainEventsService } from '../../../common/events/domain-events.service';
import { EVENTS } from '@nexa/event-bus';
import { CmiPaymentProvider } from './cmi-payment.provider';

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
    private readonly domainEvents: DomainEventsService,
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
        { id: booking.id },
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

    const totalPaid = Number(booking.total_paid ?? 0);
    const currency = booking.currency ?? 'MAD';
    const useMock = process.env.STAYS_PAYMENT_PROVIDER === 'mock';

    if (useMock) {
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

  async handleWebhookSuccess(
    provider: string,
    providerIntentId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const intent = await this.intentRepo.findOne({
      where: { provider, provider_intent_id: providerIntentId },
      relations: ['booking'],
    });

    if (!intent || intent.status === 'SUCCEEDED') {
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      const intentRepo = manager.getRepository(StaysPaymentIntent);
      const ledgerRepo = manager.getRepository(StaysLedgerEntry);
      const bookingRepo = manager.getRepository(StaysBooking);
      const listingRepo = manager.getRepository(StaysListing);

      const booking = await bookingRepo.findOne({
        where: { id: intent.booking_id },
        relations: ['listing'],
      });

      if (!booking || booking.status !== 'PAYMENT_PENDING') {
        return;
      }

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
          `PAYMENT_REFUND_REQUIRED: payment succeeded but dates unavailable for booking ${booking.id}; expiring hold and creating refund ledger entry`,
        );
        await intentRepo.update(
          { id: intent.id },
          { status: 'FAILED', updated_at: new Date() },
        );
        await bookingRepo.update(
          { id: booking.id },
          { status: 'EXPIRED', updated_at: new Date() },
        );
        await ledgerRepo.save(
          ledgerRepo.create({
            booking_id: booking.id,
            type: 'REFUND',
            amount: Number(intent.amount),
            currency: booking.currency,
            status: 'PENDING',
            metadata: {
              reason: 'PAYMENT_REJECTED_DATES_UNAVAILABLE',
              provider,
              provider_intent_id: providerIntentId,
              requires_manual_review: true,
              alert_key: 'PAYMENT_REFUND_REQUIRED',
            },
          }),
        );
        await this.auditService.log({
          entityType: 'BOOKING',
          entityId: booking.id,
          action: 'PAYMENT_REJECTED_DATES_UNAVAILABLE',
          metadata: {
            provider,
            provider_intent_id: providerIntentId,
            refund_amount: Number(intent.amount),
            alert_key: 'PAYMENT_REFUND_REQUIRED',
          },
        });
        // Do not throw: acknowledge webhook so the provider does not retry.
        return;
      }

      const amount = Number(intent.amount);
      const guestFee = Number(booking.guest_fee ?? 0);
      const hostFee = Number(booking.host_fee ?? 0);
      const payoutAmount = Number(booking.payout_amount ?? 0);

      await intentRepo.update(
        { id: intent.id },
        { status: 'SUCCEEDED', updated_at: new Date() },
      );

      await bookingRepo.update(
        { id: booking.id },
        {
          status: 'CONFIRMED',
          confirmed_at: new Date(),
          paid_at: new Date(),
        },
      );

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
    });

    const confirmedBooking = await this.bookingRepo.findOne({
      where: { id: intent.booking_id },
      relations: ['listing'],
    });
    if (!confirmedBooking) return;
    const listing = confirmedBooking.listing as StaysListing;
    const hostUserId = listing?.host_user_id;
    if (hostUserId) {
      const total = Number(confirmedBooking.total_paid ?? 0);
      const currency = confirmedBooking.currency ?? 'MAD';
      void this.domainEvents.publish(EVENTS.PAYMENT_SUCCEEDED, 'stays', {
        bookingId: intent.booking_id,
        provider,
        providerIntentId,
        amount: String(total),
        currency,
      });
      void this.domainEvents.publish(EVENTS.BOOKING_CONFIRMED, 'stays', {
        bookingId: intent.booking_id,
        listingId: confirmedBooking.listing_id,
        hostUserId,
        guestUserId: confirmedBooking.guest_user_id,
        amount: String(total),
        currency,
      });
    }
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
