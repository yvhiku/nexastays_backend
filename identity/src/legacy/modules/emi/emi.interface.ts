/**
 * EMI Provider Interface
 *
 * This interface defines the contract for EMI (Electronic Money Institution) providers.
 * All fund movement operations must go through an implementation of this interface.
 *
 * Current implementations:
 * - EMIMockProvider: Internal ledger operations (no external EMI)
 *
 * Future implementations:
 * - EMI{PartnerName}Provider: Real EMI API integration
 *
 * The interface pattern allows swapping providers without modifying wallet/transfer logic.
 */

import { EntityManager } from 'typeorm';
import {
  EMITopUpRequest,
  EMITopUpResponse,
  EMITransferRequest,
  EMITransferResponse,
  EMIWithdrawalRequest,
  EMIWithdrawalResponse,
  EMIMerchantPaymentRequest,
  EMIMerchantPaymentResponse,
  EMIBalanceCheckRequest,
  EMIBalanceCheckResponse,
  EMIOperationStatusRequest,
  EMIOperationStatusResponse,
  EMIWebhookEvent,
  EMIReconciliationData,
  EMIProviderConfig,
} from './emi.types';

/**
 * EMI Provider Interface
 *
 * Implementations must handle all fund movement operations.
 * Each method should be idempotent based on the idempotency_key.
 */
export interface IEMIProvider {
  /**
   * Provider configuration
   */
  readonly config: EMIProviderConfig;

  /**
   * Initialize the provider (called on module init)
   */
  initialize(): Promise<void>;

  /**
   * Health check for the provider
   */
  healthCheck(): Promise<{ healthy: boolean; message?: string }>;

  /**
   * Top-up / Cash-in operation
   *
   * Credits user wallet from external source.
   * For mock provider: directly credits internal ledger.
   * For real EMI: initiates external settlement flow.
   *
   * @param request - Top-up request details
   * @param manager - Optional EntityManager for transaction context
   */
  initiateTopUp(
    request: EMITopUpRequest,
    manager?: EntityManager,
  ): Promise<EMITopUpResponse>;

  /**
   * P2P Transfer operation
   *
   * Transfers funds between two wallets.
   * For mock provider: internal ledger transfer (no EMI movement).
   * For real EMI: may require EMI notification for compliance.
   *
   * @param request - Transfer request details
   * @param manager - Optional EntityManager for transaction context
   */
  initiateTransfer(
    request: EMITransferRequest,
    manager?: EntityManager,
  ): Promise<EMITransferResponse>;

  /**
   * Withdrawal / Cash-out operation
   *
   * Withdraws funds from wallet to external bank account.
   * For mock provider: debits internal ledger, marks as pending.
   * For real EMI: initiates bank payout via EMI.
   *
   * @param request - Withdrawal request details
   * @param manager - Optional EntityManager for transaction context
   */
  initiateWithdrawal(
    request: EMIWithdrawalRequest,
    manager?: EntityManager,
  ): Promise<EMIWithdrawalResponse>;

  /**
   * Merchant Payment operation
   *
   * Processes payment from customer to merchant.
   * For mock provider: internal ledger transfer.
   * For real EMI: may require settlement tracking.
   *
   * @param request - Merchant payment request details
   * @param manager - Optional EntityManager for transaction context
   */
  initiateMerchantPayment(
    request: EMIMerchantPaymentRequest,
    manager?: EntityManager,
  ): Promise<EMIMerchantPaymentResponse>;

  /**
   * Check wallet balance
   *
   * Returns current available and pending balance.
   *
   * @param request - Balance check request
   * @param manager - Optional EntityManager for transaction context
   */
  checkBalance(
    request: EMIBalanceCheckRequest,
    manager?: EntityManager,
  ): Promise<EMIBalanceCheckResponse>;

  /**
   * Get operation status
   *
   * Query the status of a previous operation.
   *
   * @param request - Status query request
   */
  getOperationStatus(
    request: EMIOperationStatusRequest,
  ): Promise<EMIOperationStatusResponse>;

  /**
   * Process incoming webhook from EMI
   *
   * Validates signature and processes the event.
   * For mock provider: no-op (no external webhooks).
   *
   * @param event - Webhook event data
   */
  processWebhook(event: EMIWebhookEvent): Promise<{
    processed: boolean;
    action?: string;
    error?: string;
  }>;

  /**
   * Get reconciliation data for a date
   *
   * Returns data needed for daily reconciliation.
   *
   * @param date - Date to get reconciliation data for
   */
  getReconciliationData(date: Date): Promise<EMIReconciliationData>;
}

/**
 * EMI Provider Token for dependency injection
 */
export const EMI_PROVIDER = 'EMI_PROVIDER';

/**
 * Abstract base class for EMI providers
 *
 * Provides common functionality and logging.
 */
export abstract class EMIProviderBase implements IEMIProvider {
  abstract readonly config: EMIProviderConfig;

  abstract initialize(): Promise<void>;
  abstract healthCheck(): Promise<{ healthy: boolean; message?: string }>;

  abstract initiateTopUp(
    request: EMITopUpRequest,
    manager?: EntityManager,
  ): Promise<EMITopUpResponse>;

  abstract initiateTransfer(
    request: EMITransferRequest,
    manager?: EntityManager,
  ): Promise<EMITransferResponse>;

  abstract initiateWithdrawal(
    request: EMIWithdrawalRequest,
    manager?: EntityManager,
  ): Promise<EMIWithdrawalResponse>;

  abstract initiateMerchantPayment(
    request: EMIMerchantPaymentRequest,
    manager?: EntityManager,
  ): Promise<EMIMerchantPaymentResponse>;

  abstract checkBalance(
    request: EMIBalanceCheckRequest,
    manager?: EntityManager,
  ): Promise<EMIBalanceCheckResponse>;

  abstract getOperationStatus(
    request: EMIOperationStatusRequest,
  ): Promise<EMIOperationStatusResponse>;

  abstract processWebhook(event: EMIWebhookEvent): Promise<{
    processed: boolean;
    action?: string;
    error?: string;
  }>;

  abstract getReconciliationData(date: Date): Promise<EMIReconciliationData>;

  /**
   * Generate unique operation ID
   */
  protected generateOperationId(): string {
    return `EMI-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Validate idempotency key format
   */
  protected validateIdempotencyKey(key: string): boolean {
    return key != null && key.length >= 8 && key.length <= 128;
  }
}
