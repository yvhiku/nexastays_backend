import { Global, Module } from '@nestjs/common';
import {
  createAlertingService,
  createErrorMonitoring,
  type AlertingService,
  type ErrorMonitoringService,
} from '@nexa/telemetry';
import { ObservabilityInternalController } from './observability-internal.controller';
import { ALERTING, ERROR_MONITORING } from './observability.tokens';

export { ALERTING, ERROR_MONITORING };

@Global()
@Module({
  controllers: [ObservabilityInternalController],
  providers: [
    {
      provide: ERROR_MONITORING,
      useFactory: (): ErrorMonitoringService =>
        createErrorMonitoring({ service: 'nexa-identity' }),
    },
    {
      provide: ALERTING,
      useFactory: (): AlertingService => createAlertingService('nexa-identity'),
    },
  ],
  exports: [ERROR_MONITORING, ALERTING],
})
export class ObservabilityModule {}
