import { Injectable } from '@nestjs/common';
import { DbHealthService } from './common/database/db-health.service';

@Injectable()
export class AppService {
  constructor(private readonly dbHealth: DbHealthService) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getHealth(): Promise<{
    status: string;
    timestamp: string;
    uptime: number;
    db?: string;
  }> {
    const base = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
    const ok = await this.dbHealth.check();
    return {
      ...base,
      status: ok ? 'ok' : 'degraded',
      db: ok ? 'connected' : 'error',
    };
  }
}
