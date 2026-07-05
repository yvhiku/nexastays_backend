import { Module } from '@nestjs/common';
import { StaysModule } from '../../modules/stays/stays.module';
import { StaysPaymentsModule } from '../../modules/stays/payments/stays-payments.module';

/**
 * Nexa Stays domain: listings, bookings, host verification, payments.
 * Uses unified auth (Pay/Go). Guests: kyc_status APPROVED from any product.
 * Only hosts need stays host verification.
 */
@Module({
  imports: [StaysModule, StaysPaymentsModule],
  exports: [StaysModule, StaysPaymentsModule],
})
export class StaysDomainModule {}
