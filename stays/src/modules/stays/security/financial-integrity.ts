/**
 * Financial integrity helpers for booking/payment amounts (MAD).
 */
export function assertPositiveMoney(amount: number, label = 'amount'): number {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${label} must be greater than zero`);
  }
  return n;
}

/** Round to 2 decimal places (MAD). */
export function roundMoney(amount: number): number {
  return Math.round((Number(amount) + Number.EPSILON) * 100) / 100;
}

/** Intent amount must equal the server-side booking total (no client override). */
export function lockIntentAmount(
  bookingTotalPaid: number,
  clientOverride?: number,
): number {
  const locked = assertPositiveMoney(bookingTotalPaid, 'booking total');
  if (clientOverride != null && Number(clientOverride) !== locked) {
    throw new Error('Client amount override is not allowed');
  }
  return roundMoney(locked);
}
