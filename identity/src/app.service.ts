import { Injectable, Inject, Optional } from '@nestjs/common';
import type { AlertingService } from '@nexa/telemetry';
import { ObsEvents } from '@nexa/telemetry';
import { DbHealthService } from './common/database/db-health.service';
import { getReleaseMetadata } from './common/security/release-metadata';
import { ALERTING } from './common/observability/observability.tokens';

@Injectable()
export class AppService {
  constructor(
    private readonly dbHealth: DbHealthService,
    @Optional() @Inject(ALERTING) private readonly alerting?: AlertingService,
  ) {}

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

  async getReadiness(): Promise<{
    ok: boolean;
    status: 'ok' | 'unavailable';
    check: 'ready';
    timestamp: string;
    uptime: number;
    db: 'connected' | 'error';
    service: string;
  }> {
    const ok = await this.dbHealth.check();
    if (!ok) {
      void this.alerting?.alert({
        key: ObsEvents.READINESS_FAILURE,
        severity: 'P1',
        message: 'Identity readiness check failed (database)',
        fingerprint: 'identity:readiness:db',
        context: { service: 'nexa-identity', dependency: 'postgresql' },
      });
    }
    return {
      ok,
      status: ok ? 'ok' : 'unavailable',
      check: 'ready',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      db: ok ? 'connected' : 'error',
      service: 'nexa-identity',
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
