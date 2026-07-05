/**
 * EMI Service
 *
 * High-level service that orchestrates EMI operations.
 * This service is the primary entry point for wallet/transaction modules.
 *
 * Responsibilities:
 * - Delegates operations to the configured EMI provider
 * - Handles operation lifecycle and status tracking
 * - Provides audit logging for all operations
 * - Coordinates with fraud detection before operations
 */

import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import type { IEMIProvider } from './emi.interface';
import { EMI_PROVIDER } from './emi.interface';
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
  EMIOperationStatus,
  EMIOperationType,
} from './emi.types';
import { AuditService } from '../audit/audit.service';

export interface EMIServiceConfig {
  enable_audit_logging: boolean;
  enable_notifications: boolean;
}

@Injectable()
export class EMIService implements OnModuleInit {
  private readonly logger = new Logger(EMIService.name);
  private readonly config: EMIServiceConfig = {
    enable_audit_logging: true,
    enable_notifications: true,
  };

  constructor(
    @Inject(EMI_PROVIDER)
    private readonly emiProvider: IEMIProvider,
    private readonly auditService: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log(
      `Initializing EMI Service with provider: ${this.emiProvider.config.provider_name}`,
    );
    await this.emiProvider.initialize();

    const health = await this.emiProvider.healthCheck();
    if (!health.healthy) {
      this.logger.error(`EMI Provider health check failed: ${health.message}`);
    } else {
      this.logger.log(`EMI Provider healthy: ${health.message}`);
    }
  }

  /**
   * Get provider information
   */
  getProviderInfo(): { name: string; enabled: boolean } {
    return {
      name: this.emiProvider.config.provider_name,
      enabled: this.emiProvider.config.enable_real_settlement,
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    return this.emiProvider.healthCheck();
  }

  /**
   * Initiate wallet top-up
   *
   * Credits user wallet from external source.
   * This is the entry point for all cash-in operations.
   */
  async initiateTopUp(
    request: EMITopUpRequest,
    manager?: EntityManager,
  ): Promise<EMITopUpResponse> {
    this.logger.log(`[TopUp] Starting for user: ${request.user_id}`);

    const response = await this.emiProvider.initiateTopUp(request, manager);

    if (this.config.enable_audit_logging) {
      await this.auditOperation({
        operation_type: EMIOperationType.TOPUP,
        operation_id: response.operation_id,
        user_id: request.user_id,
        amount: request.amount,
        status: response.status,
        idempotency_key: request.idempotency_key,
        error: response.error?.code,
      });
    }

    return response;
  }

  /**
   * Initiate P2P transfer
   *
   * Transfers funds between two wallets.
   * This is the entry point for all P2P transfer operations.
   */
  async initiateTransfer(
    request: EMITransferRequest,
    manager?: EntityManager,
  ): Promise<EMITransferResponse> {
    this.logger.log(
      `[Transfer] Starting: ${request.sender_user_id} -> ${request.receiver_user_id}`,
    );

    const response = await this.emiProvider.initiateTransfer(request, manager);

    if (this.config.enable_audit_logging) {
      await this.auditOperation({
        operation_type: EMIOperationType.TRANSFER,
        operation_id: response.operation_id,
        user_id: request.sender_user_id,
        receiver_user_id: request.receiver_user_id,
        amount: request.amount,
        status: response.status,
        idempotency_key: request.idempotency_key,
        error: response.error?.code,
      });
    }

    return response;
  }

  /**
   * Initiate withdrawal to bank
   *
   * Withdraws funds from wallet to external bank account.
   * This is the entry point for all cash-out operations.
   */
  async initiateWithdrawal(
    request: EMIWithdrawalRequest,
    manager?: EntityManager,
  ): Promise<EMIWithdrawalResponse> {
    this.logger.log(`[Withdrawal] Starting for user: ${request.user_id}`);

    const response = await this.emiProvider.initiateWithdrawal(
      request,
      manager,
    );

    if (this.config.enable_audit_logging) {
      await this.auditOperation({
        operation_type: EMIOperationType.WITHDRAWAL,
        operation_id: response.operation_id,
        user_id: request.user_id,
        amount: request.amount,
        status: response.status,
        idempotency_key: request.idempotency_key,
        beneficiary_bank: request.beneficiary.bank_code,
        error: response.error?.code,
      });
    }

    return response;
  }

  /**
   * Initiate merchant payment
   *
   * Processes payment from customer to merchant.
   * This is the entry point for QR/NFC payment operations.
   */
  async initiateMerchantPayment(
    request: EMIMerchantPaymentRequest,
    manager?: EntityManager,
  ): Promise<EMIMerchantPaymentResponse> {
    this.logger.log(
      `[MerchantPayment] Starting: ${request.payer_user_id} -> ${request.merchant_user_id}`,
    );

    const response = await this.emiProvider.initiateMerchantPayment(
      request,
      manager,
    );

    if (this.config.enable_audit_logging) {
      await this.auditOperation({
        operation_type: EMIOperationType.MERCHANT_PAYMENT,
        operation_id: response.operation_id,
        user_id: request.payer_user_id,
        merchant_user_id: request.merchant_user_id,
        amount: request.amount,
        status: response.status,
        idempotency_key: request.idempotency_key,
        error: response.error?.code,
      });
    }

    return response;
  }

  /**
   * Check wallet balance via EMI
   */
  async checkBalance(
    request: EMIBalanceCheckRequest,
    manager?: EntityManager,
  ): Promise<EMIBalanceCheckResponse> {
    return this.emiProvider.checkBalance(request, manager);
  }

  /**
   * Get operation status
   */
  async getOperationStatus(
    operationType: EMIOperationType,
    idempotencyKey?: string,
    operationId?: string,
  ) {
    return this.emiProvider.getOperationStatus({
      operation_type: operationType,
      idempotency_key: idempotencyKey,
      operation_id: operationId,
    });
  }

  /**
   * Check if operation completed successfully
   */
  isOperationSuccessful(status: EMIOperationStatus): boolean {
    return status === EMIOperationStatus.COMPLETED;
  }

  /**
   * Check if operation failed
   */
  isOperationFailed(status: EMIOperationStatus): boolean {
    return (
      status === EMIOperationStatus.FAILED ||
      status === EMIOperationStatus.REVERSED
    );
  }

  /**
   * Check if operation is pending
   */
  isOperationPending(status: EMIOperationStatus): boolean {
    return (
      status === EMIOperationStatus.INITIATED ||
      status === EMIOperationStatus.SENT_TO_PARTNER ||
      status === EMIOperationStatus.PENDING_CONFIRMATION
    );
  }

  /**
   * Generate idempotency key for operation
   */
  generateIdempotencyKey(
    operationType: string,
    userId: string,
    uniqueId?: string,
  ): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    const unique = uniqueId ?? random;
    return `${operationType.toLowerCase()}_${userId}_${timestamp}_${unique}`;
  }

  /**
   * Audit an EMI operation
   */
  private async auditOperation(params: {
    operation_type: EMIOperationType;
    operation_id: string;
    user_id: string;
    receiver_user_id?: string;
    merchant_user_id?: string;
    amount: number;
    status: EMIOperationStatus;
    idempotency_key: string;
    beneficiary_bank?: string;
    error?: string;
  }): Promise<void> {
    try {
      await this.auditService.audit({
        action: `EMI_${params.operation_type}`,
        targetType: 'EMI_OPERATION',
        targetId: params.operation_id,
        actorUserId: params.user_id,
        metadata: {
          operation_type: params.operation_type,
          operation_id: params.operation_id,
          status: params.status,
          amount: params.amount,
          idempotency_key: params.idempotency_key,
          receiver_user_id: params.receiver_user_id,
          merchant_user_id: params.merchant_user_id,
          beneficiary_bank: params.beneficiary_bank,
          error: params.error,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to audit EMI operation: ${params.operation_id}`,
        err,
      );
    }
  }
}
