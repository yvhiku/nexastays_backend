/** Logical operation class for idempotency keys (one scope per HTTP money-moving surface). */
export enum MoneyMovementScope {
  P2P_TRANSFER = 'P2P_TRANSFER',
  QR_PAYMENT = 'QR_PAYMENT',
  NFC_PAYMENT = 'NFC_PAYMENT',
  TOPUP = 'TOPUP',
  WITHDRAW = 'WITHDRAW',
  /** Admin compensating workflow; use when a ledger-backed refund POST exists. */
  REFUND = 'REFUND',
  ADMIN_TRANSACTION_REVERSAL = 'ADMIN_TRANSACTION_REVERSAL',
  STAYS_WALLET_PAYMENT = 'STAYS_WALLET_PAYMENT',
  SUBSCRIPTION_PRO = 'SUBSCRIPTION_PRO',
}
