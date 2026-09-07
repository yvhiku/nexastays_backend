import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { StaysBooking } from '../entities/stays-booking.entity';
import { StaysLedgerEntry } from '../entities/stays-ledger-entry.entity';
import { StaysListing } from '../entities/stays-listing.entity';
import { StaysPaymentIntent } from '../entities/stays-payment-intent.entity';
import { StaysAuditService } from './stays-audit.service';
import { DomainEventsService } from '../../../common/events/domain-events.service';
import { EVENTS } from '@nexa/event-bus';
import { MessagingStateService } from '../../messaging/messaging-state.service';
import { StaysPaymentsService } from '../payments/stays-payments.service';
import { isMockPaymentProvider } from '../payments/payment-provider.config';

type CancellationPolicy = 'FLEXIBLE' | 'MODERATE' | 'STRICT';

@Injectable()
export class StaysCancellationService {
  private readonly logger = new Logger(StaysCancellationService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(StaysBooking)
    private readonly bookingRepo: Repository<StaysBooking>,
    @InjectRepository(StaysLedgerEntry)
    private readonly ledgerRepo: Repository<StaysLedgerEntry>,
    @InjectRepository(StaysListing)
    private readonly listingRepo: Repository<StaysListing>,
    @InjectRepository(StaysPaymentIntent)
    private readonly intentRepo: Repository<StaysPaymentIntent>,
    private readonly auditService: StaysAuditService,
    private readonly domainEvents: DomainEventsService,
    private readonly messagingState: MessagingStateService,
    @Optional()
    @Inject(forwardRef(() => StaysPaymentsService))
    private readonly paymentsService?: StaysPaymentsService,
  ) {}

  async cancel(
    bookingId: string,
    userId: string,
    cancelledBy: 'guest' | 'host',
    reason?: string,
    auditContext?: { ip?: string; userAgent?: string },
  ) {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: ['listing', 'listing.rules'],
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const listing = booking.listing as StaysListing & {
      rules?: { cancellation_policy?: CancellationPolicy };
    };
    const isGuest = booking.guest_user_id === userId;
    const isHost = listing?.host_user_id === userId;

    if (!isGuest && !isHost) {
      throw new NotFoundException('Booking not found');
    }

    if (cancelledBy === 'guest' && !isGuest) {
      throw new BadRequestException('Only the guest can cancel as guest');
    }
    if (cancelledBy === 'host' && !isHost) {
      throw new BadRequestException('Only the host can cancel as host');
    }

    const nonCancellable = [
      'COMPLETED',
      'CANCELLED_BY_GUEST',
      'CANCELLED_BY_HOST',
      'EXPIRED',
    ];
    if (nonCancellable.includes(booking.status)) {
      throw new BadRequestException(
        `Cannot cancel booking in status ${booking.status}`,
      );
    }

    const policy: CancellationPolicy =
      listing?.rules?.cancellation_policy ?? 'MODERATE';
    const checkinDate = new Date(booking.checkin_date);
    const now = new Date();
    const hoursToCheckin =
      (checkinDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    const theoreticalRefund = this.calculateRefund(
      policy,
      hoursToCheckin,
      Number(booking.total_subtotal),
      Number(booking.guest_fee ?? 0),
    );

    const status =
      cancelledBy === 'guest' ? 'CANCELLED_BY_GUEST' : 'CANCELLED_BY_HOST';

    let refundAmount = 0;
    let hadSettledGuestPayment = false;
    const cmiVoidCandidates: string[] = [];

    await this.dataSource.transaction(async (manager) => {
      const bookingRepo = manager.getRepository(StaysBooking);
      const ledgerRepo = manager.getRepository(StaysLedgerEntry);

      const lockedBooking = await bookingRepo
        .createQueryBuilder('b')
        .setLock('pessimistic_write')
        .where('b.id = :id', { id: bookingId })
        .getOne();

      if (!lockedBooking) {
        throw new NotFoundException('Booking not found');
      }

      if (nonCancellable.includes(lockedBooking.status)) {
        throw new BadRequestException(
          `Cannot cancel booking in status ${lockedBooking.status}`,
        );
      }

      const cancelUpdate = await bookingRepo.update(
        { id: bookingId, status: lockedBooking.status },
        { status, updated_at: new Date() },
      );
      if (!cancelUpdate.affected) {
        throw new ConflictException('Booking status changed concurrently');
      }

      // Financial invariant: REFUND only when a settled GUEST_PAYMENT exists.
      // Provider-agnostic — MOCK / CMI both settle via confirmPaymentSuccess.
      const settledGuestPayment = await ledgerRepo.findOne({
        where: {
          booking_id: bookingId,
          type: 'GUEST_PAYMENT',
          status: 'SETTLED',
        },
      });
      hadSettledGuestPayment = !!settledGuestPayment;

      const existingRefund = settledGuestPayment
        ? await ledgerRepo.findOne({
            where: { booking_id: bookingId, type: 'REFUND' },
          })
        : null;

      if (settledGuestPayment && !existingRefund && theoreticalRefund > 0) {
        refundAmount = theoreticalRefund;
        await ledgerRepo.save(
          ledgerRepo.create({
            booking_id: bookingId,
            type: 'REFUND',
            amount: refundAmount,
            currency: booking.currency,
            status: 'PENDING',
            metadata: {
              cancellation_policy: policy,
              cancelled_by: cancelledBy,
              reason,
            },
          }),
        );
      }

      // Collect unpaid CMI PreAuth intents to void after commit.
      const intentRepo = manager.getRepository(StaysPaymentIntent);
      if (!settledGuestPayment) {
        const openCmi = await intentRepo.find({
          where: {
            booking_id: bookingId,
            provider: 'cmi',
            status: In(['PENDING', 'FAILED']),
          },
        });
        for (const row of openCmi) {
          if (row.provider_intent_id)
            cmiVoidCandidates.push(row.provider_intent_id);
        }
      }

      // Stale PENDING intents must not remain payable after cancel.
      await intentRepo.update(
        { booking_id: bookingId, status: 'PENDING' },
        { status: 'CANCELLED', updated_at: new Date() },
      );

      await this.auditService.log({
        actorUserId: userId,
        actorRole: cancelledBy.toUpperCase(),
        entityType: 'BOOKING',
        entityId: bookingId,
        action: 'BOOKING_CANCELLED',
        metadata: {
          cancelled_by: cancelledBy,
          reason,
          refund_amount: refundAmount,
          theoretical_refund_amount: theoreticalRefund,
          had_settled_guest_payment: !!settledGuestPayment,
        },
        ip: auditContext?.ip,
        userAgent: auditContext?.userAgent,
      });
    });

    // CMI-only gateway side effects (mock remains ledger-only).
    if (!isMockPaymentProvider() && this.paymentsService) {
      if (hadSettledGuestPayment && refundAmount > 0) {
        try {
          await this.paymentsService.refundCmiForBooking(
            bookingId,
            refundAmount,
            booking.currency,
          );
        } catch (err) {
          this.logger.error(
            `CMI refund after cancel failed for ${bookingId}: ${
              err instanceof Error ? err.message : err
            }`,
          );
        }
      } else {
        for (const oid of cmiVoidCandidates) {
          try {
            await this.paymentsService.voidCmiPreAuth(oid, {
              reason: 'BOOKING_CANCELLED_UNPAID',
              booking_id: bookingId,
            });
          } catch (err) {
            this.logger.warn(
              `CMI void after unpaid cancel failed for ${oid}: ${
                err instanceof Error ? err.message : err
              }`,
            );
          }
        }
      }
    }

    const hostUserId = listing?.host_user_id;
    if (hostUserId) {
      void this.domainEvents.publish(EVENTS.BOOKING_CANCELLED, 'stays', {
        bookingId,
        listingId: booking.listing_id,
        guestUserId: booking.guest_user_id,
        hostUserId,
        cancelledBy,
      });
    }

    void this.messagingState.syncFromBooking(bookingId);

    const updated = await this.bookingRepo.findOne({
      where: { id: bookingId },
    });
    return {
      id: updated!.id,
      status: updated!.status,
      refund_amount: refundAmount,
    };
  }

  private calculateRefund(
    policy: CancellationPolicy,
    hoursToCheckin: number,
    subtotal: number,
    guestFee: number,
  ): number {
    const totalPaid = subtotal + guestFee;

    switch (policy) {
      case 'FLEXIBLE': {
        if (hoursToCheckin >= 24) return totalPaid;
        // 1 night penalty - approximate as subtotal/nights, for simplicity use 10% min
        const penalty = Math.max(subtotal * 0.1, 0);
        return Math.max(0, Math.round((totalPaid - penalty) * 100) / 100);
      }

      case 'MODERATE':
        if (hoursToCheckin >= 5 * 24) return totalPaid;
        if (hoursToCheckin >= 24)
          return Math.round(totalPaid * 0.5 * 100) / 100;
        return 0;

      case 'STRICT':
        if (hoursToCheckin >= 7 * 24)
          return Math.round(totalPaid * 0.5 * 100) / 100;
        return 0;

      default:
        return 0;
    }
  }
}
