import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HostsService } from './hosts.service';
import { HostOnboardingService } from './host-onboarding.service';
import { HostApplicationsService } from './host-applications.service';
import { StaysHostProfile } from '../entities/stays-host-profile.entity';
import { StaysAuditLog } from '../entities/stays-audit-log.entity';
import { HostApplication } from '../entities/host-application.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StaysHostProfile,
      StaysAuditLog,
      HostApplication,
    ]),
  ],
  providers: [HostsService, HostOnboardingService, HostApplicationsService],
  exports: [HostsService, HostOnboardingService, HostApplicationsService],
})
export class HostsModule {}
