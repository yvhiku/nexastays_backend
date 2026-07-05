export enum MoneyMovementIdempotencyStatus {
  IN_FLIGHT = 'IN_FLIGHT',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  /** Outcome unknown (e.g. 5xx / process death after possible PSP side-effects). Requires reconciliation; same key must not auto-retry money work. */
  UNCERTAIN = 'UNCERTAIN',
}
