import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './common/database/database.module';
import { ThrottlerKeyGuard } from './common/guards/throttler-key.guard';
import { MetricsModule } from './common/metrics/metrics.module';
import { MetricsInterceptor } from './common/metrics';
import { IdentityCoreModule } from './domains/identity-core/identity-core.module';
import { IdentityComplianceModule } from './domains/identity-compliance/identity-compliance.module';
import { IdentitySecurityModule } from './domains/identity-security/identity-security.module';
import { DomainEventsModule } from './common/events/domain-events.module';
import { AdminCoreModule } from './modules/admin/admin-core.module';

@Module({
  imports: [
    DatabaseModule,
    MetricsModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: process.env.NODE_ENV === 'production' ? 120 : 5000,
      },
    ]),
    IdentityCoreModule,
    IdentityComplianceModule,
    IdentitySecurityModule,
    DomainEventsModule,
    AdminCoreModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerKeyGuard },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule {}
