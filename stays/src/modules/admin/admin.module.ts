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
    ]),
  ],
  controllers: [AdminStaysController],
  providers: [AdminStaysService],
})
export class AdminModule {}
