import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../users/entities/user.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { LedgerAccount } from '../ledger/entities/ledger-account.entity';
import { LedgerEntry } from '../ledger/entities/ledger-entry.entity';
import { Ride } from '../go-taxi/entities/ride.entity';
import { Order } from '../go-delivery/orders/entities/order.entity';
import { AppTransaction } from '../transactions/entities/app-transaction.entity';
import { TransactionFee } from '../transactions/entities/transaction-fee.entity';
import { KycProfile } from '../compliance/entities/kyc-profile.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { RiskAlert } from './entities/risk-alert.entity';
import { SupportTicket } from './entities/support-ticket.entity';
import { RefundRequest } from './entities/refund-request.entity';
import { FeatureFlag } from './entities/feature-flag.entity';
import { FraudEvent } from '../fraud/entities/fraud-event.entity';
import { SarReport } from '../compliance/entities/sar-report.entity';
import { ReconciliationIssue } from '../reconciliation/entities/reconciliation-issue.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { TrustedDevice } from '../auth/entities/trusted-device.entity';
import {
  StaysListing,
  StaysBooking,
  StaysHostProfile,
  StaysAuditLog,
  HostApplication,
} from '../stays/entities';
import { HostsModule } from '../stays/hosts/hosts.module';
import { AccountTypeGuard } from '../../common/guards/account-type.guard';
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminFinanceController } from './controllers/admin-finance.controller';
import { AdminSupportController } from './controllers/admin-support.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminTransactionsController } from './controllers/admin-transactions.controller';
import { AdminWalletsController } from './controllers/admin-wallets.controller';
import { AdminKycController } from './controllers/admin-kyc.controller';
import { AdminKycPolicyController } from './controllers/admin-kyc-policy.controller';
import { AdminRiskController } from './controllers/admin-risk.controller';
import { AdminAuditController } from './controllers/admin-audit.controller';
import { AdminSystemController } from './controllers/admin-system.controller';
import { AdminWaitlistController } from './controllers/admin-waitlist.controller';
import { AdminFraudController } from './controllers/admin-fraud.controller';
import { AdminSarController } from './controllers/admin-sar.controller';
import { AdminReconciliationController } from './controllers/admin-reconciliation.controller';
import { AdminStaysController } from './controllers/admin-stays.controller';
import { AdminGoRegistrationController } from './controllers/admin-go-registration.controller';
import { AdminEcosystemController } from './controllers/admin-ecosystem.controller';
import { AdminGoController } from './controllers/admin-go.controller';
import { AdminGoPricingController } from './controllers/admin-go-pricing.controller';
import { AdminActivityController } from './controllers/admin-activity.controller';
import { AdminSearchController } from './controllers/admin-search.controller';
import { AdminNotificationsController } from './controllers/admin-notifications.controller';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminEcosystemService } from './services/admin-ecosystem.service';
import { AdminGoService } from './services/admin-go.service';
import { AdminGoPricingService } from './services/admin-go-pricing.service';
import { AdminActivityService } from './services/admin-activity.service';
import { AdminSearchService } from './services/admin-search.service';
import { AdminNotificationsService } from './services/admin-notifications.service';
import { AdminStaysService } from './services/admin-stays.service';
import { AdminFinanceService } from './services/admin-finance.service';
import { AdminSupportService } from './services/admin-support.service';
import { AdminSystemFeatureFlagsService } from './services/admin-system-feature-flags.service';
import { AdminPayConfigService } from './services/admin-pay-config.service';
import { AdminUsersService } from './services/admin-users.service';
import { AdminTransactionsService } from './services/admin-transactions.service';
import { AdminWalletsService } from './services/admin-wallets.service';
import { AdminKycService } from './services/admin-kyc.service';
import { AdminKycPolicyService } from './services/admin-kyc-policy.service';
import { AdminRiskService } from './services/admin-risk.service';
import { AdminAuditService } from './services/admin-audit.service';
import { LedgerModule } from '../ledger/ledger.module';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { RegistrationApplicationsModule } from '../go-taxi/registration-applications/registration-applications.module';
import { DatabaseModule } from '../../common/database/database.module';
import { CommonCacheModule } from '../../common/cache/cache.module';
import { UsersModule } from '../users/users.module';
import { GoPricingConfig } from '../go-taxi/pricing/entities/go-pricing-config.entity';
import { GoPricingConfigAudit } from '../go-taxi/pricing/entities/go-pricing-config-audit.entity';
import { PricingModule } from '../go-taxi/pricing/pricing.module';
import { MoneyMovementIdempotencyModule } from '../../common/idempotency/money-movement-idempotency.module';
import { AuditModule } from '../audit/audit.module';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';

import { KycTierPolicy } from '../compliance/kyc-policy/entities/kyc-tier-policy.entity';
import { KycAdminOverride } from '../compliance/kyc-policy/entities/kyc-admin-override.entity';

@Module({
  imports: [
    AuthModule,
    AuditModule,
    DatabaseModule,
    UsersModule,
    CommonCacheModule,
    LedgerModule,
    ReconciliationModule,
    WaitlistModule,
    RegistrationApplicationsModule,
    HostsModule,
    PricingModule,
    MoneyMovementIdempotencyModule,
    TypeOrmModule.forFeature([
      User,
      Wallet,
      LedgerAccount,
      LedgerEntry,
      Ride,
      Order,
      GoPricingConfig,
      GoPricingConfigAudit,
      AppTransaction,
      TransactionFee,
      KycProfile,
      AuditLog,
      RiskAlert,
      SupportTicket,
      RefundRequest,
      FeatureFlag,
      FraudEvent,
      SarReport,
      ReconciliationIssue,
      RefreshToken,
      TrustedDevice,
      StaysListing,
      StaysBooking,
      StaysHostProfile,
      StaysAuditLog,
      HostApplication,
      KycTierPolicy,
      KycAdminOverride,
    ]),
  ],
  controllers: [
    AdminDashboardController,
    AdminFinanceController,
    AdminSupportController,
    AdminUsersController,
    AdminTransactionsController,
    AdminWalletsController,
    AdminKycController,
    AdminKycPolicyController,
    AdminRiskController,
    AdminAuditController,
    AdminSystemController,
    AdminWaitlistController,
    AdminFraudController,
    AdminSarController,
    AdminReconciliationController,
    AdminStaysController,
    AdminGoRegistrationController,
    AdminEcosystemController,
    AdminGoController,
    AdminGoPricingController,
    AdminActivityController,
    AdminSearchController,
    AdminNotificationsController,
  ],
  providers: [
    AccountTypeGuard,
    AdminDashboardService,
    AdminEcosystemService,
    AdminGoService,
    AdminGoPricingService,
    AdminFinanceService,
    AdminSupportService,
    AdminSystemFeatureFlagsService,
    AdminUsersService,
    AdminTransactionsService,
    AdminWalletsService,
    AdminKycService,
    AdminKycPolicyService,
    AdminRiskService,
    AdminAuditService,
    AdminStaysService,
    AdminActivityService,
    AdminSearchService,
    AdminPayConfigService,
    AdminNotificationsService,
  ],
})
export class AdminModule {}
