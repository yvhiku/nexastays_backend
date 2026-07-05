import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MoneyMovementIdempotencyRecord } from './money-movement-idempotency-record.entity';
import { MoneyMovementIdempotencyService } from './money-movement-idempotency.service';

@Module({
  imports: [TypeOrmModule.forFeature([MoneyMovementIdempotencyRecord])],
  providers: [MoneyMovementIdempotencyService],
  exports: [MoneyMovementIdempotencyService, TypeOrmModule],
})
export class MoneyMovementIdempotencyModule {}
