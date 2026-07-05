import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceController } from './compliance.controller';
import { ComplianceSarController } from './compliance-sar.controller';
import { ComplianceService } from './compliance.service';
import { SarService } from './sar.service';
import { OtpSessionResolverGuard } from '../../common/guards/otp-session-resolver.guard';
import { KycProfile } from './entities/kyc-profile.entity';
import { TransactionLimit } from './entities/transaction-limit.entity';
import { SarReport } from './entities/sar-report.entity';
import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../../common/database/database.module';
import { CommonCacheModule } from '../../common/cache/cache.module';
import { FraudEvent } from '../fraud/entities/fraud-event.entity';

@Module({
  imports: [
    DatabaseModule,
    CommonCacheModule,
    UsersModule,
    TypeOrmModule.forFeature([
      KycProfile,
      TransactionLimit,
      SarReport,
      FraudEvent,
      User,
    ]),
    AuditModule,
  ],
  controllers: [ComplianceController, ComplianceSarController],
  providers: [ComplianceService, SarService, OtpSessionResolverGuard],
  exports: [ComplianceService, SarService, TypeOrmModule],
})
export class ComplianceModule {}
