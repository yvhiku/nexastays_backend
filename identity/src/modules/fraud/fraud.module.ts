import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FraudService } from './fraud.service';
import { FraudEvent } from './entities/fraud-event.entity';
import { AppTransaction } from '../transactions/entities/app-transaction.entity';
import { TrustedDevice } from '../auth/entities/trusted-device.entity';
import { KycProfile } from '../compliance/entities/kyc-profile.entity';
import { TransactionLimit } from '../compliance/entities/transaction-limit.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { RiskAlert } from '../admin/entities/risk-alert.entity';
import { ComplianceModule } from '../compliance/compliance.module';
import { SecurityEventsModule } from '../security-events/security-events.module';

@Module({
  imports: [
    ComplianceModule,
    SecurityEventsModule,
    TypeOrmModule.forFeature([
      FraudEvent,
      AppTransaction,
      TrustedDevice,
      KycProfile,
      TransactionLimit,
      AuditLog,
      RiskAlert,
    ]),
  ],
  providers: [FraudService],
  exports: [FraudService],
})
export class FraudModule {}
