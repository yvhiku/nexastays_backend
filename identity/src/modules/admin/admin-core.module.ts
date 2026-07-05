import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../users/entities/user.entity';
import { KycProfile } from '../compliance/entities/kyc-profile.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { FraudEvent } from '../fraud/entities/fraud-event.entity';
import { SarReport } from '../compliance/entities/sar-report.entity';
import { RiskAlert } from './entities/risk-alert.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { TrustedDevice } from '../auth/entities/trusted-device.entity';
import { AppTransaction } from '../transactions/entities/app-transaction.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { ReconciliationIssue } from '../reconciliation/entities/reconciliation-issue.entity';
import { AccountTypeGuard } from '../../common/guards/account-type.guard';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminKycController } from './controllers/admin-kyc.controller';
import { AdminAuditController } from './controllers/admin-audit.controller';
import { AdminFraudController } from './controllers/admin-fraud.controller';
import { AdminSarController } from './controllers/admin-sar.controller';
import { AdminRiskController } from './controllers/admin-risk.controller';
import { AdminUsersService } from './services/admin-users.service';
import { AdminKycService } from './services/admin-kyc.service';
import { AdminRiskService } from './services/admin-risk.service';
import { AdminAuditService } from './services/admin-audit.service';
import { DatabaseModule } from '../../common/database/database.module';
import { CommonCacheModule } from '../../common/cache/cache.module';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';
import { IdentitySnapshotModule } from '../identity-snapshot/identity-snapshot.module';

/** Identity-only admin — Pay/Go/Stays admin routes live in product services or legacy. */
@Module({
  imports: [
    AuthModule,
    AuditModule,
    DatabaseModule,
    UsersModule,
    CommonCacheModule,
    IdentitySnapshotModule,
    TypeOrmModule.forFeature([
      User,
      KycProfile,
      AuditLog,
      FraudEvent,
      SarReport,
      RiskAlert,
      RefreshToken,
      TrustedDevice,
      AppTransaction,
      Wallet,
      ReconciliationIssue,
    ]),
  ],
  controllers: [
    AdminUsersController,
    AdminKycController,
    AdminAuditController,
    AdminFraudController,
    AdminSarController,
    AdminRiskController,
  ],
  providers: [
    AccountTypeGuard,
    AdminUsersService,
    AdminKycService,
    AdminRiskService,
    AdminAuditService,
  ],
})
export class AdminCoreModule {}
