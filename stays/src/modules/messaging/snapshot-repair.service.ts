import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaysConversation } from './entities/stays-conversation.entity';
import { StaysBooking } from '../stays/entities/stays-booking.entity';
import { StaysListing } from '../stays/entities/stays-listing.entity';
import { TimelineSeederService } from './timeline-seeder.service';
import type { ReservationSnapshot } from './messaging.types';

@Injectable()
export class SnapshotRepairService {
  private readonly logger = new Logger(SnapshotRepairService.name);

  constructor(
    @InjectRepository(StaysConversation)
    private readonly convRepo: Repository<StaysConversation>,
    @InjectRepository(StaysBooking)
    private readonly bookingRepo: Repository<StaysBooking>,
    @InjectRepository(StaysListing)
    private readonly listingRepo: Repository<StaysListing>,
    private readonly timelineSeeder: TimelineSeederService,
  ) {}

  /** Booking facts only — identity is always live via PresentationService. */
  isSnapshotIncomplete(snapshot: ReservationSnapshot | null | undefined): boolean {
    if (!snapshot?.listingTitle) return true;
    if (!snapshot.listingId) return true;
    if (!snapshot.checkinDate || !snapshot.checkoutDate) return true;
    if (!snapshot.coverMediaId && !snapshot.primaryPhotoUrl) return true;
    return false;
  }

  async repairConversation(conversationId: string): Promise<boolean> {
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv) return false;

    const current = conv.reservation_snapshot as unknown as ReservationSnapshot;
    if (!this.isSnapshotIncomplete(current)) {
      return false;
    }

    if (!conv.booking_id || !conv.listing_id) {
      this.logger.warn(`Cannot repair conversation ${conversationId}: missing booking/listing`);
      return false;
    }

    const [booking, listing] = await Promise.all([
      this.bookingRepo.findOne({ where: { id: conv.booking_id } }),
      this.listingRepo.findOne({
        where: { id: conv.listing_id },
        relations: ['media'],
      }),
    ]);

    if (!booking || !listing) return false;

    const snapshot = this.timelineSeeder.buildSnapshot(booking, listing);

    conv.reservation_snapshot = snapshot as unknown as StaysConversation['reservation_snapshot'];
    conv.snapshot_version = (conv.snapshot_version ?? 1) + 1;
    await this.convRepo.save(conv);

    this.logger.log(`Repaired booking snapshot for conversation ${conversationId}`);
    return true;
  }
}
