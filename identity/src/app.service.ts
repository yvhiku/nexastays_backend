import { Injectable } from '@nestjs/common';
import { DbHealthService } from './common/database/db-health.service';
import { getReleaseMetadata } from './common/security/release-metadata';

@Injectable()
export class AppService {
  constructor(private readonly dbHealth: DbHealthService) {}

  getHello(): string {
    return 'Hello World!';
  }

  /** Liveness: process is up. Never depends on PostgreSQL. */
  getLiveness() {
    return {
      status: 'ok' as const,
      check: 'live' as const,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  /**
   * Readiness: able to serve traffic (DB reachable).
   * Returns { ok: true } or { ok: false } — controller maps to HTTP status.
   */
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

  /** @deprecated Prefer /health/live and /health/ready. Acts as readiness. */
  async getHealth() {
    return this.getReadiness();
  }

  getVersion() {
    return getReleaseMetadata({
      ...process.env,
      NEXA_SERVICE_NAME: process.env.NEXA_SERVICE_NAME || 'nexa-identity',
    });
  }
}
