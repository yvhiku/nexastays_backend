import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaysBooking } from '../entities/stays-booking.entity';
import { StaysAvailabilityBlock } from '../entities/stays-availability-block.entity';

const BOOKED_STATUSES = ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'] as const;

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
   * 1. It has an overlapping CONFIRMED/CHECKED_IN/COMPLETED booking
   * 2. It has any blocked date in the range (stays_availability_blocks.is_blocked = true)
   */
  async getUnavailableListingIds(
    checkinDate: Date,
    checkoutDate: Date,
    listingIds?: string[],
  ): Promise<string[]> {
    const checkin = this.toDateString(checkinDate);
    const checkout = this.toDateString(checkoutDate);

    // Overlap: (A_start < B_end) AND (A_end > B_start)
    const unavailableFromBookings = await this.bookingRepo
      .createQueryBuilder('b')
      .select('DISTINCT b.listing_id')
      .where('b.status IN (:...statuses)', { statuses: BOOKED_STATUSES })
      .andWhere('b.checkin_date < :checkout', { checkout })
      .andWhere('b.checkout_date > :checkin', { checkin })
      .andWhere(listingIds?.length ? 'b.listing_id IN (:...listingIds)' : '1=1', {
        listingIds: listingIds ?? [],
      })
      .getRawMany<{ listing_id: string }>()
      .then((rows) => rows.map((r) => r.listing_id));

    const unavailableFromBlocks = await this.availabilityRepo
      .createQueryBuilder('ab')
      .select('DISTINCT ab.listing_id')
      .where('ab.is_blocked = true')
      .andWhere('ab.date >= :checkin', { checkin })
      .andWhere('ab.date < :checkout', { checkout })
      .andWhere(listingIds?.length ? 'ab.listing_id IN (:...listingIds)' : '1=1', {
        listingIds: listingIds ?? [],
      })
      .getRawMany<{ listing_id: string }>()
      .then((rows) => rows.map((r) => r.listing_id));

    return [...new Set([...unavailableFromBookings, ...unavailableFromBlocks])];
  }

  /**
   * Check if a specific listing is available for the date range.
   */
  async isListingAvailable(
    listingId: string,
    checkinDate: Date,
    checkoutDate: Date,
  ): Promise<boolean> {
    const unavailable = await this.getUnavailableListingIds(
      checkinDate,
      checkoutDate,
      [listingId],
    );
    return !unavailable.includes(listingId);
  }

  private toDateString(d: Date | string): string {
    if (typeof d === 'string') return d.split('T')[0];
    return d.toISOString().split('T')[0];
  }
}
