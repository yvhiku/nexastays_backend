import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { StaysBooking } from '../entities/stays-booking.entity';
import { StaysAvailabilityBlock } from '../entities/stays-availability-block.entity';

/** Statuses that occupy listing nights (hotel model: [checkin, checkout)). */
export const BOOKED_STATUSES = [
  'INITIATED',
  'PAYMENT_PENDING',
  'CONFIRMED',
  'CHECKED_IN',
  'COMPLETED',
] as const;

export type BookedStatus = (typeof BOOKED_STATUSES)[number];

export type BlockedDateRange = {
  checkin_date: string;
  checkout_date: string;
  source: 'BOOKING' | 'BLOCK';
};

@Injectable()
export class StaysAvailabilityService {
  constructor(
    @InjectRepository(StaysBooking)
    private readonly bookingRepo: Repository<StaysBooking>,
    @InjectRepository(StaysAvailabilityBlock)
    private readonly availabilityRepo: Repository<StaysAvailabilityBlock>,
  ) {}

  /**
   * Returns listing IDs that are NOT available for the given date range.
   * A listing is unavailable if:
   * 1. It has an overlapping active/paid booking (incl. pending payment holds)
   * 2. It has any blocked date in the range (stays_availability_blocks.is_blocked = true)
   */
  async getUnavailableListingIds(
    checkinDate: Date | string,
    checkoutDate: Date | string,
    listingIds?: string[],
    options?: { excludeBookingId?: string; manager?: EntityManager },
  ): Promise<string[]> {
    const checkin = this.toDateString(checkinDate);
    const checkout = this.toDateString(checkoutDate);
    const bookingRepo = options?.manager
      ? options.manager.getRepository(StaysBooking)
      : this.bookingRepo;
    const availabilityRepo = options?.manager
      ? options.manager.getRepository(StaysAvailabilityBlock)
      : this.availabilityRepo;

    const bookingQb = bookingRepo
      .createQueryBuilder('b')
      .select('DISTINCT b.listing_id', 'listing_id')
      .where('b.status IN (:...statuses)', { statuses: [...BOOKED_STATUSES] })
      .andWhere('b.checkin_date < :checkout', { checkout })
      .andWhere('b.checkout_date > :checkin', { checkin });

    if (listingIds?.length) {
      bookingQb.andWhere('b.listing_id IN (:...listingIds)', { listingIds });
    }
    if (options?.excludeBookingId) {
      bookingQb.andWhere('b.id != :excludeBookingId', {
        excludeBookingId: options.excludeBookingId,
      });
    }

    const unavailableFromBookings = await bookingQb
      .getRawMany<{ listing_id: string }>()
      .then((rows) =>
        rows
          .map((r) => r.listing_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      );

    const blocksQb = availabilityRepo
      .createQueryBuilder('ab')
      .select('DISTINCT ab.listing_id', 'listing_id')
      .where('ab.is_blocked = true')
      .andWhere('ab.date >= :checkin', { checkin })
      .andWhere('ab.date < :checkout', { checkout });

    if (listingIds?.length) {
      blocksQb.andWhere('ab.listing_id IN (:...listingIds)', { listingIds });
    }

    const unavailableFromBlocks = await blocksQb
      .getRawMany<{ listing_id: string }>()
      .then((rows) =>
        rows
          .map((r) => r.listing_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      );

    return [...new Set([...unavailableFromBookings, ...unavailableFromBlocks])];
  }

  /**
   * Check if a specific listing is available for the date range.
   */
  async isListingAvailable(
    listingId: string,
    checkinDate: Date | string,
    checkoutDate: Date | string,
    options?: { excludeBookingId?: string; manager?: EntityManager },
  ): Promise<boolean> {
    const checkin = this.toDateString(checkinDate);
    const checkout = this.toDateString(checkoutDate);
    const bookingRepo = options?.manager
      ? options.manager.getRepository(StaysBooking)
      : this.bookingRepo;
    const availabilityRepo = options?.manager
      ? options.manager.getRepository(StaysAvailabilityBlock)
      : this.availabilityRepo;

    const bookingQb = bookingRepo
      .createQueryBuilder('b')
      .where('b.listing_id = :listingId', { listingId })
      .andWhere('b.status IN (:...statuses)', { statuses: [...BOOKED_STATUSES] })
      .andWhere('b.checkin_date < :checkout', { checkout })
      .andWhere('b.checkout_date > :checkin', { checkin });

    if (options?.excludeBookingId) {
      bookingQb.andWhere('b.id != :excludeBookingId', {
        excludeBookingId: options.excludeBookingId,
      });
    }

    const overlappingBookings = await bookingQb.getCount();
    if (overlappingBookings > 0) return false;

    const blockedNights = await availabilityRepo
      .createQueryBuilder('ab')
      .where('ab.listing_id = :listingId', { listingId })
      .andWhere('ab.is_blocked = true')
      .andWhere('ab.date >= :checkin', { checkin })
      .andWhere('ab.date < :checkout', { checkout })
      .getCount();

    return blockedNights === 0;
  }

  /**
   * Occupied night ranges for a listing (for calendar UI).
   * Nights are [checkin_date, checkout_date) — checkout day is free for a new arrival.
   */
  async getBlockedDateRanges(
    listingId: string,
    fromDate: Date | string,
    toDate: Date | string,
  ): Promise<BlockedDateRange[]> {
    const from = this.toDateString(fromDate);
    const to = this.toDateString(toDate);

    const bookings = await this.bookingRepo
      .createQueryBuilder('b')
      .select(['b.checkin_date', 'b.checkout_date'])
      .where('b.listing_id = :listingId', { listingId })
      .andWhere('b.status IN (:...statuses)', { statuses: [...BOOKED_STATUSES] })
      .andWhere('b.checkin_date < :to', { to })
      .andWhere('b.checkout_date > :from', { from })
      .getMany();

    const ranges: BlockedDateRange[] = bookings.map((b) => ({
      checkin_date: this.toDateString(b.checkin_date),
      checkout_date: this.toDateString(b.checkout_date),
      source: 'BOOKING' as const,
    }));

    const blocks = await this.availabilityRepo
      .createQueryBuilder('ab')
      .select(['ab.date'])
      .where('ab.listing_id = :listingId', { listingId })
      .andWhere('ab.is_blocked = true')
      .andWhere('ab.date >= :from', { from })
      .andWhere('ab.date < :to', { to })
      .getMany();

    for (const block of blocks) {
      const night = this.toDateString(block.date);
      ranges.push({
        checkin_date: night,
        checkout_date: this.addDays(night, 1),
        source: 'BLOCK',
      });
    }

    return ranges;
  }

  /** Calendar-safe YYYY-MM-DD (no UTC day shift). */
  toDateString(d: Date | string): string {
    if (typeof d === 'string') {
      const match = /^(\d{4}-\d{2}-\d{2})/.exec(d.trim());
      if (match) return match[1];
      const parsed = new Date(d);
      if (!Number.isNaN(parsed.getTime())) {
        return this.formatLocalDate(parsed);
      }
      return d.split('T')[0];
    }
    return this.formatLocalDate(d);
  }

  private formatLocalDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private addDays(isoDate: string, days: number): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
    if (!match) return isoDate;
    const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    d.setDate(d.getDate() + days);
    return this.formatLocalDate(d);
  }
}
