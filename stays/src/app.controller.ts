import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { MetricsService } from './common/metrics';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly metricsService: MetricsService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('ping')
  ping() {
    return { ok: true };
  }

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('metrics')
  getMetrics() {
    return this.metricsService.getMetrics();
  }
}
