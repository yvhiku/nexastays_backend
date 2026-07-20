import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaysConversation } from './entities/stays-conversation.entity';
import { MessagingStateService } from './messaging-state.service';

@Injectable()
export class MessagingLifecycleScheduler {
  private readonly logger = new Logger(MessagingLifecycleScheduler.name);

  constructor(
    @InjectRepository(StaysConversation)
    private readonly convRepo: Repository<StaysConversation>,
    private readonly messagingState: MessagingStateService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async syncMessagingStates(): Promise<void> {
    const bookingConversations = await this.convRepo.find({
      where: { type: 'BOOKING' },
      select: ['booking_id'],
    });
    for (const conv of bookingConversations) {
      if (!conv.booking_id) continue;
      try {
        await this.messagingState.syncFromBooking(conv.booking_id);
      } catch (err) {
        this.logger.warn(`Failed to sync messaging state for ${conv.booking_id}: ${err}`);
      }
    }
  }
}
