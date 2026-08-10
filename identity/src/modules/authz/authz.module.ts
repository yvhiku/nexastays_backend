import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { AuthzVersionService } from '../auth/authz-version.service';
import { RolesGuard } from '../../common/guards/roles.guard';

/**
 * SEC-003 authz version + RolesGuard for ADMIN routes.
 * Separate module avoids AuthModule ↔ SecurityEvents circular imports.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [AuthzVersionService, RolesGuard],
  exports: [AuthzVersionService, RolesGuard],
})
export class AuthzModule {}
