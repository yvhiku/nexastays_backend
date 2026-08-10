import {
  Controller,
  ForbiddenException,
  Inject,
  Post,
  Headers,
} from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { getInternalServiceKey } from '../security/secrets';
import { resolveNexaStage } from '../security/cors-origins';
import type { AlertingService, ErrorMonitoringService } from '@nexa/telemetry';
import { ALERTING, ERROR_MONITORING } from './observability.tokens';

/**
 * Internal observability probe — never public.
 * Real production (NEXA_ENV=production) requires ENABLE_OBSERVABILITY_TEST=true.
 */
@Controller('internal/observability')
export class ObservabilityInternalController {
  constructor(
    @Inject(ERROR_MONITORING)
    private readonly monitoring: ErrorMonitoringService,
    @Inject(ALERTING) private readonly alerting: AlertingService,
  ) {}

  @Post('test-alert')
  @Public()
  async testAlert(@Headers('x-internal-key') key?: string) {
    if (key !== getInternalServiceKey()) {
      throw new ForbiddenException('Internal only');
    }
    const stage = resolveNexaStage();
    if (
      stage === 'production' &&
      process.env.ENABLE_OBSERVABILITY_TEST !== 'true'
    ) {
      throw new ForbiddenException(
        'Observability test endpoint disabled in production',
      );
    }
    this.monitoring.captureMessage('observability.test', 'info', {
      event: 'OBSERVABILITY_TEST',
    });
    await this.alerting.alert({
      key: 'OBSERVABILITY_TEST',
      severity: 'P3',
      message: 'Manual observability test alert',
      force: true,
      context: { stage },
    });
    return { ok: true, event: 'OBSERVABILITY_TEST' };
  }
}
