import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
} from '@nestjs/common';
import { AppService } from './app.service';
import { MetricsService } from './common/metrics';
import { getInternalServiceKey } from './common/security/secrets';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly metricsService: MetricsService,
  ) {}

  @Get()
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('ping')
  @Public()
  ping() {
    return { ok: true };
  }

  @Get('health')
  @Public()
  getHealth() {
    return this.appService.getHealth();
  }

  /** Metrics are internal-only in production (X-Internal-Key). */
  @Get('metrics')
  @Public()
  getMetrics(@Headers('x-internal-key') key?: string) {
    if (process.env.NODE_ENV === 'production') {
      if (key !== getInternalServiceKey()) {
        throw new ForbiddenException('Metrics are not public');
      }
    }
    return this.metricsService.getMetrics();
  }
}
