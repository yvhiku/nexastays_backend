import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StaysBooking } from '../entities/stays-booking.entity';
import { StaysLedgerEntry } from '../entities/stays-ledger-entry.entity';
import { StaysListing } from '../entities/stays-listing.entity';
import { StaysAuditService } from './stays-audit.service';

type CancellationPolicy = 'FLEXIBLE' | 'MODERATE' | 'STRICT';

@Injectable()
export class StaysCancellationService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(StaysBooking)
    private readonly bookingRepo: Repository<StaysBooking>,
    @InjectRepository(StaysLedgerEntry)
    private readonly ledgerRepo: Repository<StaysLedgerEntry>,
    @InjectRepository(StaysListing)
    private readonly listingRepo: Repository<StaysListing>,
    private readonly auditService: StaysAuditService,
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

    const listing = booking.listing as StaysListing & { rules?: { cancellation_policy?: CancellationPolicy } };
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

    const nonCancellable = ['COMPLETED', 'CANCELLED_BY_GUEST', 'CANCELLED_BY_HOST', 'EXPIRED'];
    if (nonCancellable.includes(booking.status)) {
      throw new BadRequestException(`Cannot cancel booking in status ${booking.status}`);
    }

    const policy: CancellationPolicy = listing?.rules?.cancellation_policy ?? 'MODERATE';
    const checkinDate = new Date(booking.checkin_date);
    const now = new Date();
    const hoursToCheckin = (checkinDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    const refundAmount = this.calculateRefund(
      policy,
      hoursToCheckin,
      Number(booking.total_subtotal),
      Number(booking.guest_fee ?? 0),
    );

    const status = cancelledBy === 'guest' ? 'CANCELLED_BY_GUEST' : 'CANCELLED_BY_HOST';

    await this.dataSource.transaction(async (manager) => {
      const bookingRepo = manager.getRepository(StaysBooking);
      const ledgerRepo = manager.getRepository(StaysLedgerEntry);

      await bookingRepo.update({ id: bookingId }, { status });

      if (refundAmount > 0) {
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
        },
        ip: auditContext?.ip,
        userAgent: auditContext?.userAgent,
      });
    });

    const updated = await this.bookingRepo.findOne({ where: { id: bookingId } });
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
      case 'FLEXIBLE':
        if (hoursToCheckin >= 24) return totalPaid;
        // 1 night penalty - approximate as subtotal/nights, for simplicity use 10% min
        const penalty = Math.max(subtotal * 0.1, 0);
        return Math.max(0, Math.round((totalPaid - penalty) * 100) / 100);

      case 'MODERATE':
        if (hoursToCheckin >= 5 * 24) return totalPaid;
        if (hoursToCheckin >= 24) return Math.round(totalPaid * 0.5 * 100) / 100;
        return 0;

      case 'STRICT':
        if (hoursToCheckin >= 7 * 24) return Math.round(totalPaid * 0.5 * 100) / 100;
        return 0;

      default:
        return 0;
    }
  }
}
