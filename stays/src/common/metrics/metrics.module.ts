import { Global, Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { RequestCoalescingService } from '../coalescing/request-coalescing.service';

@Global()
@Module({
  providers: [MetricsService, RequestCoalescingService],
  exports: [MetricsService, RequestCoalescingService],
})
export class MetricsModule {}
