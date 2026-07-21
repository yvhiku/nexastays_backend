import { Global, Module } from '@nestjs/common';
import { StaysKycPolicyService } from './stays-kyc-policy.service';
import { IdentitySnapshotClient } from './identity-snapshot.client';
import { IdentityProfilePhotoClient } from './identity-profile-photo.client';
import { IdentityUserClient } from './identity-user.client';

@Global()
@Module({
  providers: [StaysKycPolicyService, IdentitySnapshotClient, IdentityProfilePhotoClient, IdentityUserClient],
  exports: [StaysKycPolicyService, IdentitySnapshotClient, IdentityProfilePhotoClient, IdentityUserClient],
})
export class IdentityModule {}
