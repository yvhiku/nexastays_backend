import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CalendarSyncService } from './calendar-sync.service';

@Injectable()
export class CalendarSyncSchedulerService {
  private readonly logger = new Logger(CalendarSyncSchedulerService.name);
  private running = false;

  constructor(private readonly calendarSync: CalendarSyncService) {}

  /** Drain due calendars often; each calendar self-schedules next_sync_at. */
  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const n = await this.calendarSync.processDueCalendars();
      if (n > 0) {
        this.logger.log(`Synced ${n} external calendar(s)`);
      }
    } catch (err) {
      this.logger.warn(
        `Calendar sync tick failed: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      this.running = false;
    }
  }
}
