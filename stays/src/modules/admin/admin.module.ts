import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminStaysController } from './admin-stays.controller';
import { AdminStaysService } from './admin-stays.service';
import { HostsModule } from '../stays/hosts/hosts.module';
import { StaysModule } from '../stays/stays.module';
import { SeoModule } from '../seo/seo.module';
import {
  StaysListing,
  StaysBooking,
  StaysHostProfile,
  StaysAuditLog,
  StaysListingReview,
  StaysBookingOccupant,
} from '../stays/entities';
import { StaysSupportTicket } from '../support/entities/stays-support-ticket.entity';
import { StaysConversationReport } from '../support/entities/stays-conversation-report.entity';
import { StaysSafetyIssue } from '../support/entities/stays-safety-issue.entity';

@Module({
  imports: [
    HostsModule,
    StaysModule,
    SeoModule,
    TypeOrmModule.forFeature([
      StaysListing,
      StaysBooking,
      StaysHostProfile,
      StaysAuditLog,
      StaysListingReview,
      StaysBookingOccupant,
      StaysSupportTicket,
      StaysConversationReport,
      StaysSafetyIssue,
    ]),
  ],
  controllers: [AdminStaysController],
  providers: [AdminStaysService],
})
export class AdminModule {}
