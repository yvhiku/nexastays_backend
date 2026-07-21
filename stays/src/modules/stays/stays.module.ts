import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaysController } from './stays.controller';
import { ReviewsController } from './reviews/reviews.controller';
import { StaysService } from './stays.service';
import { ExploreService } from './explore/explore.service';
import { HostsModule } from './hosts/hosts.module';
import {
  StaysListing,
  StaysListingRules,
  StaysListingMedia,
  StaysListingUnitType,
  StaysRatePlan,
  StaysCheckInContact,
  StaysBooking,
  StaysListingReview,
  StaysReviewMedia,
  StaysHostProfile,
  StaysAvailabilityBlock,
  StaysExternalCalendar,
  StaysExternalCalendarEvent,
  StaysExternalCalendarSyncLog,
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
import { CalendarSyncService } from './services/calendar-sync.service';
import { CalendarSyncSchedulerService } from './services/calendar-sync-scheduler.service';
import { ReviewAggregateService } from './reviews/review-aggregate.service';
import { DomainEventsModule } from '../../common/events/domain-events.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [
    DomainEventsModule,
    forwardRef(() => MessagingModule),
    TypeOrmModule.forFeature([
      StaysListing,
      StaysListingRules,
      StaysListingMedia,
      StaysListingUnitType,
      StaysRatePlan,
      StaysCheckInContact,
      StaysBooking,
      StaysListingReview,
      StaysReviewMedia,
      StaysHostProfile,
      StaysAvailabilityBlock,
      StaysExternalCalendar,
      StaysExternalCalendarEvent,
      StaysExternalCalendarSyncLog,
      StaysPaymentIntent,
      StaysLedgerEntry,
      StaysAuditLog,
    ]),
    HostsModule,
  ],
  controllers: [StaysController, ReviewsController],
  providers: [
    StaysService,
    ExploreService,
    StaysReviewsService,
    ReviewAggregateService,
    StaysAvailabilityService,
    StaysAuditService,
    StaysCancellationService,
    HostListingsService,
    HostDashboardService,
    BookingLifecycleService,
    BookingLifecycleSchedulerService,
    CalendarSyncService,
    CalendarSyncSchedulerService,
  ],
  exports: [
    StaysService,
    StaysReviewsService,
    StaysAvailabilityService,
    ExploreService,
    CalendarSyncService,
  ],
})
export class StaysModule {}
