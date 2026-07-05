import { Module } from '@nestjs/common';
import { AuditModule } from '../../modules/audit/audit.module';
import { SecurityEventsModule } from '../../modules/security-events/security-events.module';

/**
 * Identity Security — audit logs, fraud signals, security events.
 */
@Module({
  imports: [AuditModule, SecurityEventsModule],
  exports: [AuditModule, SecurityEventsModule],
})
export class IdentitySecurityModule {}
