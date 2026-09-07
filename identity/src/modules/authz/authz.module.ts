import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { AuthzVersionService } from '../auth/authz-version.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AccountStatusGuard } from '../../common/guards/account-status.guard';

/**
 * SEC-003 authz version + RolesGuard for ADMIN routes.
 * AccountStatusGuard enforces SUSPENDED/FROZEN/BANNED on all authenticated traffic (047).
 */
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [AuthzVersionService, RolesGuard, AccountStatusGuard],
  exports: [AuthzVersionService, RolesGuard, AccountStatusGuard],
})
export class AuthzModule {}
