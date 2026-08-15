import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupportPerformanceSnapshotService } from './support-performance-snapshot.service';
import { SupportQualitySignalsService } from './support-quality-signals.service';
import { yesterdayUtcDate } from './support-quality.config';

@Injectable()
export class SupportPerformanceScheduler {
  private readonly logger = new Logger(SupportPerformanceScheduler.name);

  constructor(
    private readonly snapshots: SupportPerformanceSnapshotService,
    private readonly quality: SupportQualitySignalsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async reconcileYesterday(): Promise<void> {
    const snapshotDate = yesterdayUtcDate();
    try {
      const result = await this.snapshots.upsertUtcDay(snapshotDate);
      this.logger.log(
        `Support performance snapshot ${snapshotDate}: upserted ${result.upserted}`,
      );
    } catch (err) {
      this.logger.error(
        `Support performance snapshot ${snapshotDate} failed`,
        err instanceof Error ? err.stack : err,
      );
    }
    try {
      await this.quality.reconcileAll();
      this.logger.log('Support quality reconciliation complete');
    } catch (err) {
      this.logger.error(
        'Support quality reconciliation failed',
        err instanceof Error ? err.stack : err,
      );
    }
  }
}
