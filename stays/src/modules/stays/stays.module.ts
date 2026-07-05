import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaysController } from './stays.controller';
import { StaysService } from './stays.service';
import { HostsModule } from './hosts/hosts.module';
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
import { HostDashboardService } from './services/host-dashboard.service';
import { StaysReviewsService } from './services/stays-reviews.service';
import { BookingLifecycleService } from './services/booking-lifecycle.service';
import { BookingLifecycleSchedulerService } from './services/booking-lifecycle-scheduler.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
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
      StaysPaymentIntent,
      StaysLedgerEntry,
      StaysAuditLog,
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
    HostDashboardService,
    BookingLifecycleService,
    BookingLifecycleSchedulerService,
  ],
  exports: [StaysService],
})
export class StaysModule {}
