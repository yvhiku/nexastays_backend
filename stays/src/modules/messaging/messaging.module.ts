import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  StaysConversation,
  StaysMessage,
  StaysMessageAttachment,
  StaysMediaAsset,
  StaysAttachmentSession,
  StaysMessagingOutbox,
  StaysMessagingAuditLog,
} from './entities';
import { StaysBooking } from '../stays/entities/stays-booking.entity';
import { StaysListing } from '../stays/entities/stays-listing.entity';
import { StaysHostProfile } from '../stays/entities/stays-host-profile.entity';
import { StaysBookingOccupant } from '../stays/entities/stays-booking-occupant.entity';
import { MessagingController } from './messaging.controller';
import { MessagingMediaController } from './messaging-media.controller';
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
import { ParticipantPresentationService } from './participant-presentation.service';
import { MessagingMediaService } from './messaging-media.service';
import { ConversationPresentationService } from './conversation-presentation.service';
import { SnapshotRepairService } from './snapshot-repair.service';
import { AttachmentService } from './attachment.service';
import { AttachmentSessionService } from './attachment-session.service';
import { MediaAssetService } from './media-asset.service';
import { AttachmentCleanupScheduler } from './attachment-cleanup.scheduler';
import { MessageSearchService } from './message-search.service';
import { DomainEventsModule } from '../../common/events/domain-events.module';
import { StaysModule } from '../stays/stays.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DomainEventsModule,
    forwardRef(() => StaysModule),
    TypeOrmModule.forFeature([
      StaysConversation,
      StaysMessage,
      StaysMessageAttachment,
      StaysMediaAsset,
      StaysAttachmentSession,
      StaysMessagingOutbox,
      StaysMessagingAuditLog,
      StaysBooking,
      StaysListing,
      StaysHostProfile,
      StaysBookingOccupant,
    ]),
  ],
  controllers: [MessagingController, MessagingMediaController],
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
    ParticipantPresentationService,
    MessagingMediaService,
    ConversationPresentationService,
    SnapshotRepairService,
    AttachmentService,
    AttachmentSessionService,
    MediaAssetService,
    AttachmentCleanupScheduler,
    MessageSearchService,
  ],
  exports: [ConversationProvisionService, MessagingStateService],
})
export class MessagingModule {}
