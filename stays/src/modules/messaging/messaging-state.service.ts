import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaysConversation } from './entities/stays-conversation.entity';
import { StaysBooking } from '../stays/entities/stays-booking.entity';

@Injectable()
export class MessagingStateService {
  constructor(
    @InjectRepository(StaysConversation)
    private readonly convRepo: Repository<StaysConversation>,
    @InjectRepository(StaysBooking)
    private readonly bookingRepo: Repository<StaysBooking>,
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
      const checkout = new Date(booking.checkout_date);
      const daysSince = (now.getTime() - checkout.getTime()) / 86_400_000;
      if (daysSince >= 365) {
        await this.convRepo.update(conv.id, {
          messaging_state: 'ARCHIVED',
          archived_at: conv.archived_at ?? now,
          conversation_version: conv.conversation_version + 1,
        });
      } else if (daysSince >= 45) {
        await this.convRepo.update(conv.id, {
          messaging_state: 'READ_ONLY',
          read_only_at: conv.read_only_at ?? now,
          conversation_version: conv.conversation_version + 1,
        });
      }
    }
  }
}
