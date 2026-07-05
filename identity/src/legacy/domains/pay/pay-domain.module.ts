import { Module } from '@nestjs/common';
import { AuthModule } from '../../modules/auth/auth.module';
import { UsersModule } from '../../modules/users/users.module';
import { WalletsModule } from '../../modules/wallets/wallets.module';
import { LedgerModule } from '../../modules/ledger/ledger.module';
import { TransactionsModule } from '../../modules/transactions/transactions.module';
import { ComplianceModule } from '../../modules/compliance/compliance.module';
import { AuditModule } from '../../modules/audit/audit.module';
import { AdminModule } from '../../modules/admin/admin.module';
import { QrModule } from '../../modules/qr/qr.module';
import { NfcModule } from '../../modules/nfc/nfc.module';
import { WaitlistModule } from '../../modules/waitlist/waitlist.module';
import { ReconciliationModule } from '../../modules/reconciliation/reconciliation.module';
import { SecurityEventsModule } from '../../modules/security-events/security-events.module';
import { ReferralsModule } from '../../modules/referrals/referrals.module';
import { RewardsProgramModule } from '../../modules/rewards-program/rewards-program.module';
import { SubscriptionModule } from '../../modules/subscription/subscription.module';

/**
 * Nexa Pay domain: wallet, auth, KYC, admin compliance, transactions, waitlist.
 * All Pay modules are grouped here for clear boundaries.
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    WalletsModule,
    LedgerModule,
    TransactionsModule,
    ComplianceModule,
    AuditModule,
    AdminModule,
    QrModule,
    NfcModule,
    WaitlistModule,
    ReconciliationModule,
    SecurityEventsModule,
    ReferralsModule,
    RewardsProgramModule,
    SubscriptionModule,
  ],
  exports: [
    AuthModule,
    UsersModule,
    WalletsModule,
    LedgerModule,
    TransactionsModule,
    ComplianceModule,
    AuditModule,
    QrModule,
    NfcModule,
    WaitlistModule,
    ReconciliationModule,
    SecurityEventsModule,
    ReferralsModule,
    SubscriptionModule,
  ],
})
export class PayDomainModule {}
