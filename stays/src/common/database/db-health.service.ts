import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

const COOLDOWN_MS = 10_000;

@Injectable()
export class DbHealthService {
  private lastFailureAt: number = 0;
  private healthy: boolean = true;

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Returns true if DB is considered healthy (no recent failure or cooldown passed).
   */
  isHealthy(): boolean {
    if (this.healthy) return true;
    return Date.now() - this.lastFailureAt >= COOLDOWN_MS;
  }

  /**
   * Call after a successful DB check (e.g. SELECT 1). Resets failure state.
   */
  markSuccess(): void {
    this.healthy = true;
  }

  /**
   * Call when a DB operation fails. Puts the service in unhealthy state until cooldown passes.
   */
  markFailure(): void {
    this.healthy = false;
    this.lastFailureAt = Date.now();
  }

  /**
   * Run a quick connectivity check. Updates internal state.
   */
  async check(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      this.markSuccess();
      return true;
    } catch {
      this.markFailure();
      return false;
    }
  }
}
