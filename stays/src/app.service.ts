import { Injectable } from '@nestjs/common';
import { DbHealthService } from './common/database/db-health.service';
import { getReleaseMetadata } from './common/security/release-metadata';

@Injectable()
export class AppService {
  constructor(private readonly dbHealth: DbHealthService) {}

  getHello(): string {
    return 'Hello World!';
  }

  getLiveness() {
    return {
      status: 'ok' as const,
      check: 'live' as const,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  async getReadiness(): Promise<{
    ok: boolean;
    status: 'ok' | 'unavailable';
    check: 'ready';
    timestamp: string;
    uptime: number;
    db: 'connected' | 'error';
  }> {
    const ok = await this.dbHealth.check();
    return {
      ok,
      status: ok ? 'ok' : 'unavailable',
      check: 'ready',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      db: ok ? 'connected' : 'error',
    };
  }

  async getHealth() {
    return this.getReadiness();
  }

  getVersion() {
    return getReleaseMetadata({
      ...process.env,
      NEXA_SERVICE_NAME: process.env.NEXA_SERVICE_NAME || 'nexa-stays',
    });
  }
}
