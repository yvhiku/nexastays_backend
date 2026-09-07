import { Global, Module } from '@nestjs/common';
import { StaysKycPolicyService } from './stays-kyc-policy.service';
import { IdentitySnapshotClient } from './identity-snapshot.client';
import { IdentityProfilePhotoClient } from './identity-profile-photo.client';
import { IdentityUserClient } from './identity-user.client';
import { IdentityAuthzClient } from './identity-authz.client';
import { RolesGuard } from '../guards/roles.guard';
import { AccountStatusGuard } from '../guards/account-status.guard';

@Global()
@Module({
  providers: [
    StaysKycPolicyService,
    IdentitySnapshotClient,
    IdentityProfilePhotoClient,
    IdentityUserClient,
    IdentityAuthzClient,
    RolesGuard,
    AccountStatusGuard,
  ],
  exports: [
    StaysKycPolicyService,
    IdentitySnapshotClient,
    IdentityProfilePhotoClient,
    IdentityUserClient,
    IdentityAuthzClient,
    RolesGuard,
    AccountStatusGuard,
  ],
})
export class IdentityModule {}
