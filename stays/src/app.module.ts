import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './common/database/database.module';
import { ThrottlerKeyGuard } from './common/guards/throttler-key.guard';
import { MetricsModule } from './common/metrics/metrics.module';
import { MetricsInterceptor } from './common/metrics';
import { StaysModule } from './modules/stays/stays.module';
import { StaysPaymentsModule } from './modules/stays/payments/stays-payments.module';
import { IdentityAuthModule } from './modules/identity-auth/identity-auth.module';
import { IdentityModule } from './common/identity/identity.module';
import { DomainEventsModule } from './common/events/domain-events.module';
import { MediaStorageModule } from './common/media/media-storage.module';
import { AdminModule } from './modules/admin/admin.module';
import { PlatformSettingsModule } from './modules/platform-settings/platform-settings.module';

@Module({
  imports: [
    DatabaseModule,
    MetricsModule,
    IdentityAuthModule,
    IdentityModule,
    DomainEventsModule,
    MediaStorageModule,
    PlatformSettingsModule,
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: process.env.NODE_ENV === 'production' ? 120 : 5000,
      },
    ]),
    StaysModule,
    StaysPaymentsModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerKeyGuard },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule {}
