import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HostsService } from './hosts.service';
import { HostApplicationsService } from './host-applications.service';
import { HostOnboardingService } from './host-onboarding.service';
import { StaysHostProfile } from '../entities/stays-host-profile.entity';
import { StaysAuditLog } from '../entities/stays-audit-log.entity';
import { User } from '../../users/entities/user.entity';
import { KycProfile } from '../../compliance/entities/kyc-profile.entity';
import { UsersModule } from '../../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StaysHostProfile,
      StaysAuditLog,
      User,
      KycProfile,
    ]),
    UsersModule,
  ],
  providers: [HostOnboardingService, HostsService, HostApplicationsService],
  exports: [HostOnboardingService, HostsService, HostApplicationsService],
})
export class HostsModule {}
