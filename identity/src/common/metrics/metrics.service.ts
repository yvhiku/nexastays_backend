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
    };
  }
}
