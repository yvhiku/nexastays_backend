import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SubscriptionService } from './subscription.service';

@Injectable()
export class SubscriptionBillingCronService {
  private readonly logger = new Logger(SubscriptionBillingCronService.name);

  constructor(private readonly subscriptionService: SubscriptionService) {}

  /** Daily at 06:30 Africa/Casablanca — renew monthly/yearly Pro subscriptions due today. */
  @Cron('0 30 6 * * *', { timeZone: 'Africa/Casablanca' })
  async runDailyProRenewals(): Promise<void> {
    try {
      const result = await this.subscriptionService.processDueRenewals();
      if (result.processed > 0) {
        this.logger.log(
          `Pro renewals: processed=${result.processed} succeeded=${result.succeeded} failed=${result.failed} cancelled=${result.cancelled}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Pro subscription renewal job failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
