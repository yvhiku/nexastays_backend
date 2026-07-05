import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DbHealthService } from '../database/db-health.service';

/**
 * When DB is unhealthy (recent failure, within cooldown), short-circuit read requests with 503.
 * Apply to read-only endpoints that hit the DB so we do not attempt queries during outage.
 */
@Injectable()
export class DbCircuitBreakerGuard implements CanActivate {
  constructor(private readonly dbHealth: DbHealthService) {}

  canActivate(_context: ExecutionContext): boolean {
    if (!this.dbHealth.isHealthy()) {
      throw new ServiceUnavailableException('Service temporarily unavailable');
    }
    return true;
  }
}
