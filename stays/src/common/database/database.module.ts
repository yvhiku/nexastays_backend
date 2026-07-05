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
  StaysPaymentIntent,
  StaysLedgerEntry,
  StaysAuditLog,
  StaysListingReview,
} from '../../modules/stays/entities';
import { StaysPlatformSettings } from '../../modules/platform-settings/stays-platform-settings.entity';

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
        StaysPaymentIntent,
        StaysLedgerEntry,
        StaysAuditLog,
        StaysListingReview,
        StaysPlatformSettings,
      ],
    }),
  ],
  providers: [DbHealthService, DbCircuitBreakerGuard],
  exports: [DbHealthService, DbCircuitBreakerGuard],
})
export class DatabaseModule {}
