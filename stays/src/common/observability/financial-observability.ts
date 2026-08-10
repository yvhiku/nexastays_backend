import type { AlertingService, ErrorMonitoringService } from '@nexa/telemetry';
import { ObsEvents } from '@nexa/telemetry';
import { isMockPaymentProvider } from '../../modules/stays/payments/payment-provider.config';

const EPS = 0.02;

/**
 * Read-only financial invariant check (PROD-OPS-003).
 * Does not mutate ledger rows.
 */
export function checkConfirmationLedgerInvariant(input: {
  guestPayment: number;
  platformFee: number;
  hostPayout: number;
  guestFee: number;
  hostFee: number;
}): { ok: true } | { ok: false; reason: string } {
  const feeSum = round2(input.guestFee + input.hostFee);
  if (Math.abs(feeSum - round2(input.platformFee)) > EPS) {
    return {
      ok: false,
      reason: 'PLATFORM_FEE_MUST_EQUAL_GUEST_FEE_PLUS_HOST_FEE',
    };
  }
  const rhs = round2(input.hostPayout + input.platformFee);
  if (Math.abs(round2(input.guestPayment) - rhs) > EPS) {
    return {
      ok: false,
      reason: 'GUEST_PAYMENT_MUST_EQUAL_HOST_PAYOUT_PLUS_PLATFORM_FEE',
    };
  }
  return { ok: true };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function reportFinancialInvariantViolation(
  deps: {
    alerting?: AlertingService;
    monitoring?: ErrorMonitoringService;
  },
  meta: {
    booking_id: string;
    payment_intent_id?: string;
    currency?: string;
    reason: string;
    amounts?: Record<string, number>;
  },
): Promise<void> {
  const payment_mode = isMockPaymentProvider() ? 'mock' : 'live';
  const err = new Error(`Financial invariant violated: ${meta.reason}`);
  deps.monitoring?.captureException(err, {
    event: ObsEvents.FINANCIAL_INVARIANT_VIOLATION,
    ...meta,
    payment_mode,
  });
  await deps.alerting?.alert({
    key: ObsEvents.FINANCIAL_INVARIANT_VIOLATION,
    severity: 'P0',
    message: err.message,
    fingerprint: `fin-invariant:${meta.booking_id}:${meta.reason}`,
    force: true,
    context: { ...meta, payment_mode },
  });
}
