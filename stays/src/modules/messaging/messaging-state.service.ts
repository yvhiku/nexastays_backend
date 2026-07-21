import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StaysConversation } from './entities/stays-conversation.entity';
import { StaysMessage } from './entities/stays-message.entity';
import { StaysBooking } from '../stays/entities/stays-booking.entity';
import { TimelineSeederService } from './timeline-seeder.service';

@Injectable()
export class MessagingStateService {
  constructor(
    @InjectRepository(StaysConversation)
    private readonly convRepo: Repository<StaysConversation>,
    @InjectRepository(StaysBooking)
    private readonly bookingRepo: Repository<StaysBooking>,
    private readonly dataSource: DataSource,
    private readonly timelineSeeder: TimelineSeederService,
  ) {}

  async syncFromBooking(bookingId: string): Promise<void> {
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
    const conv = await this.convRepo.findOne({ where: { booking_id: bookingId } });
    if (!booking || !conv) return;

    const now = new Date();
    if (
      booking.status === 'CANCELLED_BY_GUEST' ||
      booking.status === 'CANCELLED_BY_HOST'
    ) {
      await this.convRepo.update(conv.id, {
        messaging_state: 'LOCKED',
        locked_at: conv.locked_at ?? now,
        conversation_version: conv.conversation_version + 1,
      });
      return;
    }

    if (booking.status === 'COMPLETED') {
      const alreadyArchived =
        conv.messaging_state === 'ARCHIVED' &&
        conv.guest_visibility === 'ARCHIVED' &&
        conv.host_visibility === 'ARCHIVED';

      if (alreadyArchived) return;

      await this.dataSource.transaction(async (manager) => {
        const messageRepo = manager.getRepository(StaysMessage);
        const hasReviewCard = await messageRepo.exists({
          where: { conversation_id: conv.id, type: 'REVIEW_CARD' },
        });
        if (!hasReviewCard) {
          await this.timelineSeeder.seedCheckoutComplete(manager, conv, booking);
        }

        await manager.getRepository(StaysConversation).update(conv.id, {
          messaging_state: 'ARCHIVED',
          guest_visibility: 'ARCHIVED',
          host_visibility: 'ARCHIVED',
          archived_at: conv.archived_at ?? now,
          read_only_at: conv.read_only_at ?? now,
          conversation_version: conv.conversation_version + 1,
        });
      });
    }
  }
}
