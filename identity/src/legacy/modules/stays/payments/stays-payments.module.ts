import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaysPaymentIntent } from '../entities/stays-payment-intent.entity';
import { StaysLedgerEntry } from '../entities/stays-ledger-entry.entity';
import { StaysBooking } from '../entities/stays-booking.entity';
import { StaysAuditLog } from '../entities/stays-audit-log.entity';
import { StaysListing } from '../entities/stays-listing.entity';
import { User } from '../../users/entities/user.entity';
import { StaysPaymentsService } from './stays-payments.service';
import { StaysPaymentsController } from './stays-payments.controller';
import { StaysAuditService } from '../services/stays-audit.service';
import { TransactionsModule } from '../../transactions/transactions.module';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StaysPaymentIntent,
      StaysLedgerEntry,
      StaysBooking,
      StaysAuditLog,
      StaysListing,
      User,
    ]),
    TransactionsModule,
    NotificationsModule,
  ],
  controllers: [StaysPaymentsController],
  providers: [StaysPaymentsService, StaysAuditService],
  exports: [StaysPaymentsService],
})
export class StaysPaymentsModule {}
