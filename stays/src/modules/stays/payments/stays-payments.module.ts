import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaysPaymentIntent } from '../entities/stays-payment-intent.entity';
import { StaysLedgerEntry } from '../entities/stays-ledger-entry.entity';
import { StaysBooking } from '../entities/stays-booking.entity';
import { StaysAuditLog } from '../entities/stays-audit-log.entity';
import { StaysListing } from '../entities/stays-listing.entity';
import { StaysPaymentsService } from './stays-payments.service';
import { StaysPaymentsController } from './stays-payments.controller';
import { StaysAuditService } from '../services/stays-audit.service';
import { CmiPaymentProvider } from './cmi-payment.provider';
import { StaysModule } from '../stays.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StaysPaymentIntent,
      StaysLedgerEntry,
      StaysBooking,
      StaysAuditLog,
      StaysListing,
    ]),
    StaysModule,
  ],
  controllers: [StaysPaymentsController],
  providers: [StaysPaymentsService, StaysAuditService, CmiPaymentProvider],
  exports: [StaysPaymentsService],
})
export class StaysPaymentsModule {}
