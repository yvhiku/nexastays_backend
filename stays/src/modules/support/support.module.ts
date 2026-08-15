import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  StaysSupportTicket,
  StaysConversationReport,
  StaysSafetyIssue,
  StaysSupportTicketRefCounter,
  StaysSupportTicketNote,
  StaysSupportTicketCsat,
  StaysSupportCannedReply,
  StaysSupportOperationalSignal,
  StaysSupportAgentSkills,
  StaysSupportTicketViewer,
} from './entities';
import { StaysConversation } from '../messaging/entities/stays-conversation.entity';
import { StaysMessage } from '../messaging/entities/stays-message.entity';
import { StaysMessageAttachment } from '../messaging/entities/stays-message-attachment.entity';
import { StaysBooking } from '../stays/entities/stays-booking.entity';
import { StaysListing } from '../stays/entities/stays-listing.entity';
import { StaysHostProfile } from '../stays/entities/stays-host-profile.entity';
import { StaysAuditLog } from '../stays/entities/stays-audit-log.entity';
import { MessagingModule } from '../messaging/messaging.module';
import { StaysModule } from '../stays/stays.module';
import { SupportTicketsService } from './support-tickets.service';
import { SupportCannedRepliesService } from './support-canned-replies.service';
import { SupportTicketsController } from './support-tickets.controller';
import { AdminSupportController } from './admin-support.controller';
import { OperationalIntelligenceService } from './operational-intelligence.service';
import { SupportAssignmentService } from './support-assignment.service';
import { SupportAgentSkillsService } from './support-agent-skills.service';

@Module({
  imports: [
    forwardRef(() => MessagingModule),
    forwardRef(() => StaysModule),
    TypeOrmModule.forFeature([
      StaysSupportTicket,
      StaysConversationReport,
      StaysSafetyIssue,
      StaysSupportTicketRefCounter,
      StaysSupportTicketNote,
      StaysSupportTicketCsat,
      StaysSupportCannedReply,
      StaysSupportOperationalSignal,
      StaysSupportAgentSkills,
      StaysSupportTicketViewer,
      StaysConversation,
      StaysMessage,
      StaysMessageAttachment,
      StaysBooking,
      StaysListing,
      StaysHostProfile,
      StaysAuditLog,
    ]),
  ],
  controllers: [SupportTicketsController, AdminSupportController],
  providers: [
    SupportTicketsService,
    SupportCannedRepliesService,
    OperationalIntelligenceService,
    SupportAssignmentService,
    SupportAgentSkillsService,
  ],
  exports: [
    SupportTicketsService,
    SupportCannedRepliesService,
    OperationalIntelligenceService,
    SupportAssignmentService,
    SupportAgentSkillsService,
  ],
})
export class SupportModule {}
