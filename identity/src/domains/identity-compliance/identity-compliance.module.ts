import { Module } from '@nestjs/common';
import { ComplianceModule } from '../../modules/compliance/compliance.module';
import { IdentitySnapshotModule } from '../../modules/identity-snapshot/identity-snapshot.module';

/**
 * Identity Compliance — KYC (Sumsub), verification status, tier policies, snapshots.
 */
@Module({
  imports: [ComplianceModule, IdentitySnapshotModule],
  exports: [ComplianceModule, IdentitySnapshotModule],
})
export class IdentityComplianceModule {}
