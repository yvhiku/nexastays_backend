import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './common/database/database.module';
import { ThrottlerKeyGuard } from './common/guards/throttler-key.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { MetricsModule } from './common/metrics/metrics.module';
import { MetricsInterceptor } from './common/metrics';
import { IdentityCoreModule } from './domains/identity-core/identity-core.module';
import { IdentityComplianceModule } from './domains/identity-compliance/identity-compliance.module';
import { IdentitySecurityModule } from './domains/identity-security/identity-security.module';
import { DomainEventsModule } from './common/events/domain-events.module';
import { AdminCoreModule } from './modules/admin/admin-core.module';
import {
  THROTTLE_DEFAULT,
  THROTTLE_SHORT,
} from './common/abuse/throttle-presets';

@Module({
  imports: [
    DatabaseModule,
    MetricsModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([THROTTLE_SHORT, THROTTLE_DEFAULT]),
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
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule {}
