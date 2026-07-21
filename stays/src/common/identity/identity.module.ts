import { Global, Module } from '@nestjs/common';
import { StaysKycPolicyService } from './stays-kyc-policy.service';
import { IdentitySnapshotClient } from './identity-snapshot.client';
import { IdentityProfilePhotoClient } from './identity-profile-photo.client';

@Global()
@Module({
  providers: [StaysKycPolicyService, IdentitySnapshotClient, IdentityProfilePhotoClient],
  exports: [StaysKycPolicyService, IdentitySnapshotClient, IdentityProfilePhotoClient],
})
export class IdentityModule {}
