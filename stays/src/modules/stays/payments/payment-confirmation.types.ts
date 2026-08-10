export type PaymentConfirmationOutcome =
  | 'CONFIRMED'
  | 'ALREADY_PROCESSED'
  | 'INTENT_NOT_FOUND'
  | 'BOOKING_NOT_PAYABLE'
  | 'DATES_UNAVAILABLE';

export type MockPaymentConfirmStatus = 'CONFIRMED' | 'PAYMENT_ALREADY_PROCESSED';

export interface MockPaymentConfirmResult {
  status: MockPaymentConfirmStatus;
  booking_id: string;
  payment_intent_id: string;
  provider_intent_id: string;
  amount: number;
  currency: string;
}
