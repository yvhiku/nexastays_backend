import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  StaysConversation,
  StaysMessage,
  StaysMessageAttachment,
  StaysMessagingOutbox,
  StaysMessagingAuditLog,
} from './entities';
import { StaysBooking } from '../stays/entities/stays-booking.entity';
import { StaysListing } from '../stays/entities/stays-listing.entity';
import { MessagingController } from './messaging.controller';
import { ConversationsService } from './conversations.service';
import { MessagesService } from './messages.service';
import { MessagingPermissionsService } from './permissions.service';
import { MessagingRateLimitService } from './rate-limit.service';
import { TimelineSeederService } from './timeline-seeder.service';
import { ConversationProvisionService } from './conversation-provision.service';
import { MessagingStateService } from './messaging-state.service';
import { MessagingAuditService } from './audit.service';
import { MessagingOutboxService } from './outbox.service';
import { MessagingOutboxWorker } from './outbox.worker';
import { MessagingLifecycleScheduler } from './messaging-lifecycle.scheduler';
import { DomainEventsModule } from '../../common/events/domain-events.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DomainEventsModule,
    TypeOrmModule.forFeature([
      StaysConversation,
      StaysMessage,
      StaysMessageAttachment,
      StaysMessagingOutbox,
      StaysMessagingAuditLog,
      StaysBooking,
      StaysListing,
    ]),
  ],
  controllers: [MessagingController],
  providers: [
    ConversationsService,
    MessagesService,
    MessagingPermissionsService,
    MessagingRateLimitService,
    TimelineSeederService,
    ConversationProvisionService,
    MessagingStateService,
    MessagingAuditService,
    MessagingOutboxService,
    MessagingOutboxWorker,
    MessagingLifecycleScheduler,
  ],
  exports: [ConversationProvisionService, MessagingStateService],
})
export class MessagingModule {}
