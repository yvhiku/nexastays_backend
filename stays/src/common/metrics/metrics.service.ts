import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
  private totalRequests = 0;
  private status4xx = 0;
  private status5xx = 0;
  private otpSends = 0;
  private otpVerifyFailures = 0;
  private kycSubmissions = 0;
  private dbQueriesTotal = 0;
  private dbQueryFailures = 0;
  private dbCacheHits = 0;
  private dbCacheMisses = 0;
  private exploreCacheHits = 0;
  private exploreCacheMisses = 0;
  private exploreCacheBypasses = 0;
  private exploreCursorFailures = 0;
  private exploreQueryMsTotal = 0;
  private exploreQueryCount = 0;
  private exploreMapQueryMsTotal = 0;
  private exploreMapQueryCount = 0;

  incrementTotal(): void {
    this.totalRequests += 1;
  }

  incrementDbQuery(): void {
    this.dbQueriesTotal += 1;
  }

  incrementDbQueryFailure(): void {
    this.dbQueryFailures += 1;
  }

  incrementDbCacheHit(): void {
    this.dbCacheHits += 1;
  }

  incrementDbCacheMiss(): void {
    this.dbCacheMisses += 1;
  }

  incrementExploreCacheHit(): void {
    this.exploreCacheHits += 1;
  }

  incrementExploreCacheMiss(): void {
    this.exploreCacheMisses += 1;
  }

  incrementExploreCacheBypass(): void {
    this.exploreCacheBypasses += 1;
  }

  incrementExploreCursorFailure(): void {
    this.exploreCursorFailures += 1;
  }

  recordExploreQueryMs(ms: number): void {
    this.exploreQueryMsTotal += ms;
    this.exploreQueryCount += 1;
  }

  recordExploreMapQueryMs(ms: number): void {
    this.exploreMapQueryMsTotal += ms;
    this.exploreMapQueryCount += 1;
  }

  increment4xx(): void {
    this.status4xx += 1;
  }

  increment5xx(): void {
    this.status5xx += 1;
  }

  incrementOtpSend(): void {
    this.otpSends += 1;
  }

  incrementOtpVerifyFailure(): void {
    this.otpVerifyFailures += 1;
  }

  incrementKycSubmit(): void {
    this.kycSubmissions += 1;
  }

  getMetrics(): Record<string, number> {
    return {
      total_requests: this.totalRequests,
      status_4xx: this.status4xx,
      status_5xx: this.status5xx,
      otp_sends: this.otpSends,
      otp_verify_failures: this.otpVerifyFailures,
      kyc_submissions: this.kycSubmissions,
      db_queries_total: this.dbQueriesTotal,
      db_query_failures: this.dbQueryFailures,
      db_cache_hits: this.dbCacheHits,
      db_cache_misses: this.dbCacheMisses,
      explore_cache_hits: this.exploreCacheHits,
      explore_cache_misses: this.exploreCacheMisses,
      explore_cache_bypasses: this.exploreCacheBypasses,
      explore_cursor_failures: this.exploreCursorFailures,
      explore_query_count: this.exploreQueryCount,
      explore_query_ms_avg:
        this.exploreQueryCount > 0
          ? Math.round(this.exploreQueryMsTotal / this.exploreQueryCount)
          : 0,
      explore_map_query_count: this.exploreMapQueryCount,
      explore_map_query_ms_avg:
        this.exploreMapQueryCount > 0
          ? Math.round(this.exploreMapQueryMsTotal / this.exploreMapQueryCount)
          : 0,
    };
  }
}
