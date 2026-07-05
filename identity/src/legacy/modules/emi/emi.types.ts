/**
 * EMI Integration Types
 *
 * Type definitions for EMI (Electronic Money Institution) integration.
 * These types define the contract for all fund movement operations.
 */

export enum EMIOperationType {
  TOPUP = 'TOPUP',
  TRANSFER = 'TRANSFER',
  WITHDRAWAL = 'WITHDRAWAL',
  MERCHANT_PAYMENT = 'MERCHANT_PAYMENT',
  REFUND = 'REFUND',
}

export enum EMIOperationStatus {
  INITIATED = 'INITIATED',
  SENT_TO_PARTNER = 'SENT_TO_PARTNER',
  PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REVERSED = 'REVERSED',
}

export enum EMISettlementType {
  INTERNAL = 'INTERNAL',
  EXTERNAL = 'EXTERNAL',
}

export interface EMITopUpRequest {
  idempotency_key: string;
  user_id: string;
  wallet_id: string;
  amount: number;
  currency: string;
  source?: {
    type: 'BANK_TRANSFER' | 'CARD' | 'AGENT' | 'INTERNAL';
    reference?: string;
    bank_code?: string;
    account_number?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface EMITopUpResponse {
  operation_id: string;
  idempotency_key: string;
  status: EMIOperationStatus;
  settlement_type: EMISettlementType;
  emi_reference?: string;
  amount: number;
  currency: string;
  credited_at?: Date;
  /** Populated when postings are applied on the internal ledger (e.g. mock provider). */
  ledger_transaction_id?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface EMITransferRequest {
  idempotency_key: string;
  sender_user_id: string;
  sender_wallet_id: string;
  receiver_user_id: string;
  receiver_wallet_id: string;
  amount: number;
  currency: string;
  description?: string;
  reference?: string;
  metadata?: Record<string, unknown>;
}

export interface EMITransferResponse {
  operation_id: string;
  idempotency_key: string;
  status: EMIOperationStatus;
  settlement_type: EMISettlementType;
  emi_reference?: string;
  amount: number;
  currency: string;
  completed_at?: Date;
  ledger_transaction_id?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface EMIWithdrawalRequest {
  idempotency_key: string;
  user_id: string;
  wallet_id: string;
  amount: number;
  currency: string;
  beneficiary: {
    bank_code: string;
    account_number: string;
    account_holder_name: string;
    iban?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface EMIWithdrawalResponse {
  operation_id: string;
  idempotency_key: string;
  status: EMIOperationStatus;
  settlement_type: EMISettlementType;
  emi_reference?: string;
  bank_reference?: string;
  amount: number;
  currency: string;
  estimated_arrival?: Date;
  completed_at?: Date;
  ledger_transaction_id?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface EMIMerchantPaymentRequest {
  idempotency_key: string;
  payer_user_id: string;
  payer_wallet_id: string;
  merchant_user_id: string;
  merchant_wallet_id: string;
  /** Gross MAD debited from the payer. */
  amount: number;
  currency: string;
  merchant_reference?: string;
  description?: string;
  /** Optional MAD fee credited to FEES; net settles to merchant. */
  fee_amount?: number;
  metadata?: Record<string, unknown>;
}

export interface EMIMerchantPaymentResponse {
  operation_id: string;
  idempotency_key: string;
  status: EMIOperationStatus;
  settlement_type: EMISettlementType;
  emi_reference?: string;
  amount: number;
  fee_amount?: number;
  net_amount?: number;
  currency: string;
  completed_at?: Date;
  ledger_transaction_id?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface EMIBalanceCheckRequest {
  wallet_id: string;
  user_id: string;
}

export interface EMIBalanceCheckResponse {
  wallet_id: string;
  available_balance: number;
  pending_balance: number;
  currency: string;
  last_updated: Date;
}

export interface EMIOperationStatusRequest {
  operation_id?: string;
  idempotency_key?: string;
  operation_type: EMIOperationType;
}

export interface EMIOperationStatusResponse {
  operation_id: string;
  idempotency_key: string;
  operation_type: EMIOperationType;
  status: EMIOperationStatus;
  emi_reference?: string;
  amount: number;
  currency: string;
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;
  error?: {
    code: string;
    message: string;
  };
}

export interface EMIWebhookEvent {
  event_id: string;
  event_type: string;
  idempotency_key: string;
  operation_id: string;
  emi_reference: string;
  status: EMIOperationStatus;
  amount: number;
  currency: string;
  timestamp: Date;
  signature: string;
  payload: Record<string, unknown>;
}

export interface EMIReconciliationData {
  report_date: string;
  trust_account_balance: number;
  transit_account_balance: number;
  currency: string;
  transactions: Array<{
    emi_reference: string;
    operation_type: EMIOperationType;
    amount: number;
    status: EMIOperationStatus;
    timestamp: Date;
  }>;
}

export interface EMIProviderConfig {
  provider_name: string;
  api_base_url?: string;
  timeout_ms: number;
  retry_max: number;
  enable_real_settlement: boolean;
}
