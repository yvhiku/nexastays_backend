import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  StaysSupportTicket,
  StaysConversationReport,
  StaysSafetyIssue,
  StaysSupportTicketRefCounter,
} from './entities';
import { StaysConversation } from '../messaging/entities/stays-conversation.entity';
import { StaysMessage } from '../messaging/entities/stays-message.entity';
import { StaysMessageAttachment } from '../messaging/entities/stays-message-attachment.entity';
import { StaysBooking } from '../stays/entities/stays-booking.entity';
import { StaysListing } from '../stays/entities/stays-listing.entity';
import { StaysHostProfile } from '../stays/entities/stays-host-profile.entity';
import { MessagingModule } from '../messaging/messaging.module';
import { StaysModule } from '../stays/stays.module';
import { SupportTicketsService } from './support-tickets.service';
import { SupportTicketsController } from './support-tickets.controller';
import { AdminSupportController } from './admin-support.controller';

@Module({
  imports: [
    forwardRef(() => MessagingModule),
    forwardRef(() => StaysModule),
    TypeOrmModule.forFeature([
      StaysSupportTicket,
      StaysConversationReport,
      StaysSafetyIssue,
      StaysSupportTicketRefCounter,
      StaysConversation,
      StaysMessage,
      StaysMessageAttachment,
      StaysBooking,
      StaysListing,
      StaysHostProfile,
    ]),
  ],
  controllers: [SupportTicketsController, AdminSupportController],
  providers: [SupportTicketsService],
  exports: [SupportTicketsService],
})
export class SupportModule {}
