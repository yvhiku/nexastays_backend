import { Global, Module } from '@nestjs/common';
import { StaysKycPolicyService } from './stays-kyc-policy.service';
import { IdentitySnapshotClient } from './identity-snapshot.client';

@Global()
@Module({
  providers: [StaysKycPolicyService, IdentitySnapshotClient],
  exports: [StaysKycPolicyService, IdentitySnapshotClient],
})
export class IdentityModule {}
