import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaysController } from './stays.controller';
import { StaysService } from './stays.service';
import { HostsModule } from './hosts/hosts.module';
import { User } from '../users/entities/user.entity';
import {
  StaysListing,
  StaysListingRules,
  StaysListingMedia,
  StaysRatePlan,
  StaysCheckInContact,
  StaysBooking,
  StaysListingReview,
  StaysHostProfile,
  StaysAvailabilityBlock,
  StaysPaymentIntent,
  StaysLedgerEntry,
  StaysAuditLog,
} from './entities';
import { StaysCancellationService } from './services/stays-cancellation.service';
import { StaysAvailabilityService } from './services/stays-availability.service';
import { StaysAuditService } from './services/stays-audit.service';
import { HostListingsService } from './services/host-listings.service';
import { StaysReviewsService } from './services/stays-reviews.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StaysListing,
      StaysListingRules,
      StaysListingMedia,
      StaysRatePlan,
      StaysCheckInContact,
      StaysBooking,
      StaysListingReview,
      StaysHostProfile,
      StaysAvailabilityBlock,
      StaysPaymentIntent,
      StaysLedgerEntry,
      StaysAuditLog,
      User,
    ]),
    HostsModule,
  ],
  controllers: [StaysController],
  providers: [
    StaysService,
    StaysReviewsService,
    StaysAvailabilityService,
    StaysAuditService,
    StaysCancellationService,
    HostListingsService,
  ],
  exports: [StaysService],
})
export class StaysModule {}
