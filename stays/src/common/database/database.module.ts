import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from '../config/database.config';
import { DbHealthService } from './db-health.service';
import { DbCircuitBreakerGuard } from '../guards/db-circuit-breaker.guard';
import {
  HostApplication,
  StaysHostProfile,
  StaysListing,
  StaysListingRules,
  StaysListingMedia,
  StaysRatePlan,
  StaysCheckInContact,
  StaysBooking,
  StaysBookingOccupant,
  StaysAvailabilityBlock,
  StaysExternalCalendar,
  StaysExternalCalendarEvent,
  StaysExternalCalendarSyncLog,
  StaysPaymentIntent,
  StaysLedgerEntry,
  StaysAuditLog,
  StaysListingReview,
} from '../../modules/stays/entities';
import { StaysPlatformSettings } from '../../modules/platform-settings/stays-platform-settings.entity';
import {
  StaysConversation,
  StaysMessage,
  StaysMessageAttachment,
  StaysMessagingOutbox,
  StaysMessagingAuditLog,
} from '../../modules/messaging/entities';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      ...databaseConfig,
      autoLoadEntities: true,
      entities: [
        HostApplication,
        StaysHostProfile,
        StaysListing,
        StaysListingRules,
        StaysListingMedia,
        StaysRatePlan,
        StaysCheckInContact,
        StaysBooking,
        StaysBookingOccupant,
        StaysAvailabilityBlock,
        StaysExternalCalendar,
        StaysExternalCalendarEvent,
        StaysExternalCalendarSyncLog,
        StaysPaymentIntent,
        StaysLedgerEntry,
        StaysAuditLog,
        StaysListingReview,
        StaysPlatformSettings,
        StaysConversation,
        StaysMessage,
        StaysMessageAttachment,
        StaysMessagingOutbox,
        StaysMessagingAuditLog,
      ],
    }),
  ],
  providers: [DbHealthService, DbCircuitBreakerGuard],
  exports: [DbHealthService, DbCircuitBreakerGuard],
})
export class DatabaseModule {}
