import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
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
    return this.appService.getLiveness();
  }

  @Get('health')
  @Public()
  async getHealth(@Res({ passthrough: true }) res: Response) {
    const body = await this.appService.getReadiness();
    if (!body.ok) {
      res.status(503);
    }
    return body;
  }

  @Get('health/live')
  @Public()
  getLive() {
    return this.appService.getLiveness();
  }

  @Get('health/ready')
  @Public()
  async getReady() {
    const body = await this.appService.getReadiness();
    if (!body.ok) {
      throw new ServiceUnavailableException(body);
    }
    return body;
  }

  @Get('version')
  @Public()
  getVersion() {
    return this.appService.getVersion();
  }

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
