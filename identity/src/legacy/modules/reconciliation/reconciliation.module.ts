import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationController } from './reconciliation.controller';
import { LedgerEntry } from '../ledger/entities/ledger-entry.entity';
import { LedgerAccount } from '../ledger/entities/ledger-account.entity';
import { ReconciliationIssue } from './entities/reconciliation-issue.entity';
import { RiskAlert } from '../admin/entities/risk-alert.entity';
import { AuditModule } from '../audit/audit.module';

import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [
    LedgerModule,
    TypeOrmModule.forFeature([
      LedgerEntry,
      LedgerAccount,
      ReconciliationIssue,
      RiskAlert,
    ]),
    AuditModule,
  ],
  controllers: [ReconciliationController],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
