/**
 * EMI Mock Provider
 *
 * This provider implements the EMI interface using the internal ledger.
 * It serves as the default provider when no external EMI is configured.
 *
 * Behavior:
 * - All operations execute directly against the internal ledger
 * - No external API calls are made
 * - Settlement is immediate (no async confirmation needed)
 * - Webhooks are no-ops
 *
 * This allows the system to operate standalone while maintaining
 * the same interface that will be used with a real EMI partner.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { EMIProviderBase } from './emi.interface';
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
  EMIOperationStatus,
  EMISettlementType,
  EMIOperationType,
} from './emi.types';
import { LedgerService } from '../ledger/ledger.service';
import { LedgerPostingService } from '../ledger/ledger-posting.service';
import { LedgerSystemAccountType } from '../ledger/ledger-chart.constants';
import { EntryType } from '../ledger/entities/ledger-entry.entity';
import { LedgerAccount } from '../ledger/entities/ledger-account.entity';
import { LedgerEntry } from '../ledger/entities/ledger-entry.entity';

@Injectable()
export class EMIMockProvider extends EMIProviderBase {
  private readonly logger = new Logger(EMIMockProvider.name);

  readonly config: EMIProviderConfig = {
    provider_name: 'mock',
    timeout_ms: 5000,
    retry_max: 0,
    enable_real_settlement: false,
  };

  private operationStore: Map<
    string,
    {
      operation_id: string;
      idempotency_key: string;
      operation_type: EMIOperationType;
      status: EMIOperationStatus;
      amount: number;
      currency: string;
      created_at: Date;
      updated_at: Date;
      completed_at?: Date;
    }
  > = new Map();

  constructor(
    private readonly ledgerService: LedgerService,
    private readonly ledgerPostingService: LedgerPostingService,
    private readonly dataSource: DataSource,
    @InjectRepository(LedgerAccount)
    private readonly ledgerAccountRepository: Repository<LedgerAccount>,
    @InjectRepository(LedgerEntry)
    private readonly ledgerEntryRepository: Repository<LedgerEntry>,
  ) {
    super();
  }

  private async ledgerIdForReplay(
    idempotencyKey: string,
    manager?: EntityManager,
  ): Promise<string | undefined> {
    const row = await this.ledgerPostingService.findByIdempotencyKey(
      idempotencyKey,
      manager,
    );
    return row?.id;
  }

  async initialize(): Promise<void> {
    this.logger.log('EMI Mock Provider initialized');
    await this.ledgerService.ensureSystemAccounts();
    this.logger.log('System accounts verified');
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      await this.ledgerService.getSystemAccounts();
      return { healthy: true, message: 'Mock provider operational' };
    } catch (error) {
      return {
        healthy: false,
        message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async initiateTopUp(
    request: EMITopUpRequest,
    manager?: EntityManager,
  ): Promise<EMITopUpResponse> {
    const operationId = this.generateOperationId();
    const now = new Date();

    this.logger.log(
      `[TopUp] Initiating: ${request.idempotency_key}, amount: ${request.amount}`,
    );

    if (!this.validateIdempotencyKey(request.idempotency_key)) {
      return {
        operation_id: operationId,
        idempotency_key: request.idempotency_key,
        status: EMIOperationStatus.FAILED,
        settlement_type: EMISettlementType.INTERNAL,
        amount: request.amount,
        currency: request.currency,
        error: {
          code: 'INVALID_IDEMPOTENCY_KEY',
          message: 'Idempotency key must be between 8 and 128 characters',
        },
      };
    }

    const existing = this.operationStore.get(request.idempotency_key);
    if (existing) {
      this.logger.log(
        `[TopUp] Idempotent return for: ${request.idempotency_key}`,
      );
      const ledgerReplay = await this.ledgerIdForReplay(
        request.idempotency_key,
        manager,
      );
      return {
        operation_id: existing.operation_id,
        idempotency_key: existing.idempotency_key,
        status: existing.status,
        settlement_type: EMISettlementType.INTERNAL,
        amount: existing.amount,
        currency: existing.currency,
        credited_at: existing.completed_at,
        ledger_transaction_id: ledgerReplay,
      };
    }

    try {
      const executeInManager = async (mgr: EntityManager) => {
        const replay = await this.ledgerPostingService.findByIdempotencyKey(
          request.idempotency_key,
          mgr,
        );
        if (replay) {
          return replay;
        }
        const safeguarding = await this.ledgerService.getOrCreateSystemAccount(
          mgr,
          LedgerSystemAccountType.SAFEGUARDING_MIRROR,
        );
        const walletAccount = await this.ledgerService.getOrCreateWalletAccount(
          request.wallet_id,
          mgr,
        );

        const reference = `EMI-TOPUP-${request.idempotency_key}`.slice(0, 64);
        return this.ledgerPostingService.postTwoLegJournal(mgr, {
          idempotencyKey: request.idempotency_key,
          reference,
          description: `Top-up via EMI mock provider`,
          debitAccountId: safeguarding.id,
          creditAccountId: walletAccount.id,
          amount: request.amount,
          metadata: {
            scheme: 'NEXAPAY_EMI_MOCK',
            operation: EMIOperationType.TOPUP,
            user_id: request.user_id,
          },
        });
      };

      let ledgerTxnId: string | undefined;
      if (manager) {
        const lt = await executeInManager(manager);
        ledgerTxnId = lt.id;
      } else {
        await this.dataSource.transaction(async (mgr) => {
          const lt = await executeInManager(mgr);
          ledgerTxnId = lt.id;
        });
      }

      this.operationStore.set(request.idempotency_key, {
        operation_id: operationId,
        idempotency_key: request.idempotency_key,
        operation_type: EMIOperationType.TOPUP,
        status: EMIOperationStatus.COMPLETED,
        amount: request.amount,
        currency: request.currency,
        created_at: now,
        updated_at: now,
        completed_at: now,
      });

      this.logger.log(
        `[TopUp] Completed: ${request.idempotency_key}, operation: ${operationId}`,
      );

      return {
        operation_id: operationId,
        idempotency_key: request.idempotency_key,
        status: EMIOperationStatus.COMPLETED,
        settlement_type: EMISettlementType.INTERNAL,
        amount: request.amount,
        currency: request.currency,
        credited_at: now,
        ledger_transaction_id: ledgerTxnId,
      };
    } catch (error) {
      this.logger.error(
        `[TopUp] Failed: ${request.idempotency_key}`,
        error instanceof Error ? error.stack : error,
      );

      this.operationStore.set(request.idempotency_key, {
        operation_id: operationId,
        idempotency_key: request.idempotency_key,
        operation_type: EMIOperationType.TOPUP,
        status: EMIOperationStatus.FAILED,
        amount: request.amount,
        currency: request.currency,
        created_at: now,
        updated_at: now,
      });

      return {
        operation_id: operationId,
        idempotency_key: request.idempotency_key,
        status: EMIOperationStatus.FAILED,
        settlement_type: EMISettlementType.INTERNAL,
        amount: request.amount,
        currency: request.currency,
        error: {
          code: 'LEDGER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  async initiateTransfer(
    request: EMITransferRequest,
    manager?: EntityManager,
  ): Promise<EMITransferResponse> {
    const operationId = this.generateOperationId();
    const now = new Date();

    this.logger.log(
      `[Transfer] Initiating: ${request.idempotency_key}, amount: ${request.amount}`,
    );

    if (!this.validateIdempotencyKey(request.idempotency_key)) {
      return {
        operation_id: operationId,
        idempotency_key: request.idempotency_key,
        status: EMIOperationStatus.FAILED,
        settlement_type: EMISettlementType.INTERNAL,
        amount: request.amount,
        currency: request.currency,
        error: {
          code: 'INVALID_IDEMPOTENCY_KEY',
          message: 'Idempotency key must be between 8 and 128 characters',
        },
      };
    }

    const existing = this.operationStore.get(request.idempotency_key);
    if (existing) {
      this.logger.log(
        `[Transfer] Idempotent return for: ${request.idempotency_key}`,
      );
      const ledgerReplay = await this.ledgerIdForReplay(
        request.idempotency_key,
        manager,
      );
      return {
        operation_id: existing.operation_id,
        idempotency_key: existing.idempotency_key,
        status: existing.status,
        settlement_type: EMISettlementType.INTERNAL,
        amount: existing.amount,
        currency: existing.currency,
        completed_at: existing.completed_at,
        ledger_transaction_id: ledgerReplay,
      };
    }

    try {
      const executeInManager = async (mgr: EntityManager) => {
        const replay = await this.ledgerPostingService.findByIdempotencyKey(
          request.idempotency_key,
          mgr,
        );
        if (replay) {
          return replay;
        }
        const senderAccount = await this.ledgerService.getOrCreateWalletAccount(
          request.sender_wallet_id,
          mgr,
        );
        const receiverAccount =
          await this.ledgerService.getOrCreateWalletAccount(
            request.receiver_wallet_id,
            mgr,
          );

        await mgr
          .getRepository(LedgerAccount)
          .createQueryBuilder('la')
          .where('la.id = :id', { id: senderAccount.id })
          .setLock('pessimistic_write')
          .getOne();

        const balance = await this.ledgerService.getBalance(
          senderAccount.id,
          mgr,
        );
        if (balance < request.amount) {
          throw new Error('INSUFFICIENT_FUNDS');
        }

        const reference = (
          request.reference ?? `EMI-TRANSFER-${request.idempotency_key}`
        ).slice(0, 64);
        return this.ledgerPostingService.postTwoLegJournal(mgr, {
          idempotencyKey: request.idempotency_key,
          reference,
          description:
            request.description ?? 'P2P transfer via EMI mock provider',
          debitAccountId: senderAccount.id,
          creditAccountId: receiverAccount.id,
          amount: request.amount,
          metadata: {
            scheme: 'NEXAPAY_EMI_MOCK',
            operation: EMIOperationType.TRANSFER,
            sender_user_id: request.sender_user_id,
            receiver_user_id: request.receiver_user_id,
          },
        });
      };

      let ledgerTxnId: string | undefined;
      if (manager) {
        const lt = await executeInManager(manager);
        ledgerTxnId = lt.id;
      } else {
        await this.dataSource.transaction(async (mgr) => {
          const lt = await executeInManager(mgr);
          ledgerTxnId = lt.id;
        });
      }

      this.operationStore.set(request.idempotency_key, {
        operation_id: operationId,
        idempotency_key: request.idempotency_key,
        operation_type: EMIOperationType.TRANSFER,
        status: EMIOperationStatus.COMPLETED,
        amount: request.amount,
        currency: request.currency,
        created_at: now,
        updated_at: now,
        completed_at: now,
      });

      this.logger.log(
        `[Transfer] Completed: ${request.idempotency_key}, operation: ${operationId}`,
      );

      return {
        operation_id: operationId,
        idempotency_key: request.idempotency_key,
        status: EMIOperationStatus.COMPLETED,
        settlement_type: EMISettlementType.INTERNAL,
        amount: request.amount,
        currency: request.currency,
        completed_at: now,
        ledger_transaction_id: ledgerTxnId,
      };
    } catch (error) {
      this.logger.error(
        `[Transfer] Failed: ${request.idempotency_key}`,
        error instanceof Error ? error.stack : error,
      );

      const errorCode =
        error instanceof Error && error.message === 'INSUFFICIENT_FUNDS'
          ? 'INSUFFICIENT_FUNDS'
          : 'LEDGER_ERROR';

      this.operationStore.set(request.idempotency_key, {
        operation_id: operationId,
        idempotency_key: request.idempotency_key,
        operation_type: EMIOperationType.TRANSFER,
        status: EMIOperationStatus.FAILED,
        amount: request.amount,
        currency: request.currency,
        created_at: now,
        updated_at: now,
      });

      return {
        operation_id: operationId,
        idempotency_key: request.idempotency_key,
        status: EMIOperationStatus.FAILED,
        settlement_type: EMISettlementType.INTERNAL,
        amount: request.amount,
        currency: request.currency,
        error: {
          code: errorCode,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  async initiateWithdrawal(
    request: EMIWithdrawalRequest,
    manager?: EntityManager,
  ): Promise<EMIWithdrawalResponse> {
    const operationId = this.generateOperationId();
    const now = new Date();

    this.logger.log(
      `[Withdrawal] Initiating: ${request.idempotency_key}, amount: ${request.amount}`,
    );

    if (!this.validateIdempotencyKey(request.idempotency_key)) {
      return {
        operation_id: operationId,
        idempotency_key: request.idempotency_key,
        status: EMIOperationStatus.FAILED,
        settlement_type: EMISettlementType.INTERNAL,
        amount: request.amount,
        currency: request.currency,
        error: {
          code: 'INVALID_IDEMPOTENCY_KEY',
          message: 'Idempotency key must be between 8 and 128 characters',
        },
      };
    }

    const existing = this.operationStore.get(request.idempotency_key);
    if (existing) {
      this.logger.log(
        `[Withdrawal] Idempotent return for: ${request.idempotency_key}`,
      );
      const ledgerReplay = await this.ledgerIdForReplay(
        request.idempotency_key,
        manager,
      );
      return {
        operation_id: existing.operation_id,
        idempotency_key: existing.idempotency_key,
        status: existing.status,
        settlement_type: EMISettlementType.INTERNAL,
        amount: existing.amount,
        currency: existing.currency,
        completed_at: existing.completed_at,
        ledger_transaction_id: ledgerReplay,
      };
    }

    try {
      const executeInManager = async (mgr: EntityManager) => {
        const replay = await this.ledgerPostingService.findByIdempotencyKey(
          request.idempotency_key,
          mgr,
        );
        if (replay) {
          return replay;
        }
        const walletAccount = await this.ledgerService.getOrCreateWalletAccount(
          request.wallet_id,
          mgr,
        );
        const safeguarding = await this.ledgerService.getOrCreateSystemAccount(
          mgr,
          LedgerSystemAccountType.SAFEGUARDING_MIRROR,
        );

        await mgr
          .getRepository(LedgerAccount)
          .createQueryBuilder('la')
          .where('la.id = :id', { id: walletAccount.id })
          .setLock('pessimistic_write')
          .getOne();

        const balance = await this.ledgerService.getBalance(
          walletAccount.id,
          mgr,
        );
        if (balance < request.amount) {
          throw new Error('INSUFFICIENT_FUNDS');
        }

        const reference = `EMI-WITHDRAW-${request.idempotency_key}`.slice(0, 64);
        return this.ledgerPostingService.postTwoLegJournal(mgr, {
          idempotencyKey: request.idempotency_key,
          reference,
          description: `Withdrawal to bank: ${request.beneficiary.bank_code}`,
          debitAccountId: walletAccount.id,
          creditAccountId: safeguarding.id,
          amount: request.amount,
          metadata: {
            scheme: 'NEXAPAY_EMI_MOCK',
            operation: EMIOperationType.WITHDRAWAL,
            user_id: request.user_id,
          },
        });
      };

      let ledgerTxnId: string | undefined;
      if (manager) {
        const lt = await executeInManager(manager);
        ledgerTxnId = lt.id;
      } else {
        await this.dataSource.transaction(async (mgr) => {
          const lt = await executeInManager(mgr);
          ledgerTxnId = lt.id;
        });
      }

      this.operationStore.set(request.idempotency_key, {
        operation_id: operationId,
        idempotency_key: request.idempotency_key,
        operation_type: EMIOperationType.WITHDRAWAL,
        status: EMIOperationStatus.COMPLETED,
        amount: request.amount,
        currency: request.currency,
        created_at: now,
        updated_at: now,
        completed_at: now,
      });

      this.logger.log(
        `[Withdrawal] Completed: ${request.idempotency_key}, operation: ${operationId}`,
      );

      return {
        operation_id: operationId,
        idempotency_key: request.idempotency_key,
        status: EMIOperationStatus.COMPLETED,
        settlement_type: EMISettlementType.INTERNAL,
        amount: request.amount,
        currency: request.currency,
        completed_at: now,
        bank_reference: `MOCK-BANK-${Date.now()}`,
        ledger_transaction_id: ledgerTxnId,
      };
    } catch (error) {
      this.logger.error(
        `[Withdrawal] Failed: ${request.idempotency_key}`,
        error instanceof Error ? error.stack : error,
      );

      const errorCode =
        error instanceof Error && error.message === 'INSUFFICIENT_FUNDS'
          ? 'INSUFFICIENT_FUNDS'
          : 'LEDGER_ERROR';

      this.operationStore.set(request.idempotency_key, {
        operation_id: operationId,
        idempotency_key: request.idempotency_key,
        operation_type: EMIOperationType.WITHDRAWAL,
        status: EMIOperationStatus.FAILED,
        amount: request.amount,
        currency: request.currency,
        created_at: now,
        updated_at: now,
      });

      return {
        operation_id: operationId,
        idempotency_key: request.idempotency_key,
        status: EMIOperationStatus.FAILED,
        settlement_type: EMISettlementType.INTERNAL,
        amount: request.amount,
        currency: request.currency,
        error: {
          code: errorCode,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  async initiateMerchantPayment(
    request: EMIMerchantPaymentRequest,
    manager?: EntityManager,
  ): Promise<EMIMerchantPaymentResponse> {
    const operationId = this.generateOperationId();
    const now = new Date();

    this.logger.log(
      `[MerchantPayment] Initiating: ${request.idempotency_key}, amount: ${request.amount}`,
    );

    if (!this.validateIdempotencyKey(request.idempotency_key)) {
      return {
        operation_id: operationId,
        idempotency_key: request.idempotency_key,
        status: EMIOperationStatus.FAILED,
        settlement_type: EMISettlementType.INTERNAL,
        amount: request.amount,
        currency: request.currency,
        error: {
          code: 'INVALID_IDEMPOTENCY_KEY',
          message: 'Idempotency key must be between 8 and 128 characters',
        },
      };
    }

    const existing = this.operationStore.get(request.idempotency_key);
    if (existing) {
      const ledgerReplay = await this.ledgerIdForReplay(
        request.idempotency_key,
        manager,
      );
      return {
        operation_id: existing.operation_id,
        idempotency_key: existing.idempotency_key,
        status: existing.status,
        settlement_type: EMISettlementType.INTERNAL,
        amount: existing.amount,
        currency: existing.currency,
        completed_at: existing.completed_at,
        ledger_transaction_id: ledgerReplay,
      };
    }

    try {
      const feeAmount = Math.min(
        Math.max(0, request.fee_amount ?? 0),
        request.amount,
      );
      const netAmount = request.amount - feeAmount;

      const executeInManager = async (mgr: EntityManager) => {
        const replay = await this.ledgerPostingService.findByIdempotencyKey(
          request.idempotency_key,
          mgr,
        );
        if (replay) {
          return replay;
        }
        const payerAccount = await this.ledgerService.getOrCreateWalletAccount(
          request.payer_wallet_id,
          mgr,
        );
        const merchantAccount =
          await this.ledgerService.getOrCreateWalletAccount(
            request.merchant_wallet_id,
            mgr,
          );

        await mgr
          .getRepository(LedgerAccount)
          .createQueryBuilder('la')
          .where('la.id = :id', { id: payerAccount.id })
          .setLock('pessimistic_write')
          .getOne();

        const balance = await this.ledgerService.getBalance(
          payerAccount.id,
          mgr,
        );
        if (balance < request.amount) {
          throw new Error('INSUFFICIENT_FUNDS');
        }

        const reference = (
          request.merchant_reference ??
          `EMI-MERCHANT-${request.idempotency_key}`
        ).slice(0, 64);

        if (feeAmount > 0) {
          const feesAccount = await this.ledgerService.getOrCreateSystemAccount(
            mgr,
            LedgerSystemAccountType.FEES,
          );
          return this.ledgerPostingService.postJournal(mgr, {
            idempotencyKey: request.idempotency_key,
            reference,
            description:
              request.description ?? 'Merchant payment via EMI mock provider',
            metadata: {
              scheme: 'NEXAPAY_EMI_MOCK',
              operation: EMIOperationType.MERCHANT_PAYMENT,
              payer_user_id: request.payer_user_id,
              merchant_user_id: request.merchant_user_id,
              fee_amount: feeAmount,
              net_amount: netAmount,
            },
            lines: [
              {
                accountId: payerAccount.id,
                entryType: EntryType.DEBIT,
                amount: request.amount,
              },
              {
                accountId: merchantAccount.id,
                entryType: EntryType.CREDIT,
                amount: netAmount,
              },
              {
                accountId: feesAccount.id,
                entryType: EntryType.CREDIT,
                amount: feeAmount,
              },
            ],
          });
        }

        return this.ledgerPostingService.postTwoLegJournal(mgr, {
          idempotencyKey: request.idempotency_key,
          reference,
          description:
            request.description ?? 'Merchant payment via EMI mock provider',
          debitAccountId: payerAccount.id,
          creditAccountId: merchantAccount.id,
          amount: request.amount,
          metadata: {
            scheme: 'NEXAPAY_EMI_MOCK',
            operation: EMIOperationType.MERCHANT_PAYMENT,
            payer_user_id: request.payer_user_id,
            merchant_user_id: request.merchant_user_id,
            fee_amount: 0,
            net_amount: request.amount,
          },
        });
      };

      let ledgerTxnId: string | undefined;
      if (manager) {
        const lt = await executeInManager(manager);
        ledgerTxnId = lt.id;
      } else {
        await this.dataSource.transaction(async (mgr) => {
          const lt = await executeInManager(mgr);
          ledgerTxnId = lt.id;
        });
      }

      this.operationStore.set(request.idempotency_key, {
        operation_id: operationId,
        idempotency_key: request.idempotency_key,
        operation_type: EMIOperationType.MERCHANT_PAYMENT,
        status: EMIOperationStatus.COMPLETED,
        amount: request.amount,
        currency: request.currency,
        created_at: now,
        updated_at: now,
        completed_at: now,
      });

      this.logger.log(
        `[MerchantPayment] Completed: ${request.idempotency_key}`,
      );

      return {
        operation_id: operationId,
        idempotency_key: request.idempotency_key,
        status: EMIOperationStatus.COMPLETED,
        settlement_type: EMISettlementType.INTERNAL,
        amount: request.amount,
        net_amount: netAmount,
        fee_amount: feeAmount,
        currency: request.currency,
        completed_at: now,
        ledger_transaction_id: ledgerTxnId,
      };
    } catch (error) {
      this.logger.error(
        `[MerchantPayment] Failed: ${request.idempotency_key}`,
        error instanceof Error ? error.stack : error,
      );

      const errorCode =
        error instanceof Error && error.message === 'INSUFFICIENT_FUNDS'
          ? 'INSUFFICIENT_FUNDS'
          : 'LEDGER_ERROR';

      return {
        operation_id: operationId,
        idempotency_key: request.idempotency_key,
        status: EMIOperationStatus.FAILED,
        settlement_type: EMISettlementType.INTERNAL,
        amount: request.amount,
        currency: request.currency,
        error: {
          code: errorCode,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  async checkBalance(
    request: EMIBalanceCheckRequest,
    manager?: EntityManager,
  ): Promise<EMIBalanceCheckResponse> {
    const account = await this.ledgerService.getOrCreateWalletAccount(
      request.wallet_id,
      manager,
    );
    const balance = await this.ledgerService.getBalance(account.id, manager);

    return {
      wallet_id: request.wallet_id,
      available_balance: balance,
      pending_balance: 0,
      currency: 'MAD',
      last_updated: new Date(),
    };
  }

  async getOperationStatus(
    request: EMIOperationStatusRequest,
  ): Promise<EMIOperationStatusResponse> {
    const key = request.idempotency_key ?? request.operation_id;
    if (!key) {
      throw new Error(
        'Either operation_id or idempotency_key must be provided',
      );
    }

    const operation = request.idempotency_key
      ? this.operationStore.get(request.idempotency_key)
      : Array.from(this.operationStore.values()).find(
          (op) => op.operation_id === request.operation_id,
        );

    if (!operation) {
      throw new Error('Operation not found');
    }

    return {
      operation_id: operation.operation_id,
      idempotency_key: operation.idempotency_key,
      operation_type: operation.operation_type,
      status: operation.status,
      amount: operation.amount,
      currency: operation.currency,
      created_at: operation.created_at,
      updated_at: operation.updated_at,
      completed_at: operation.completed_at,
    };
  }

  async processWebhook(event: EMIWebhookEvent): Promise<{
    processed: boolean;
    action?: string;
    error?: string;
  }> {
    this.logger.log(
      `[Webhook] Mock provider received webhook (no-op): ${event.event_type}`,
    );
    return {
      processed: true,
      action: 'NO_OP_MOCK_PROVIDER',
    };
  }

  async getReconciliationData(date: Date): Promise<EMIReconciliationData> {
    const dateStr = date.toISOString().slice(0, 10);
    const startOfDay = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
    const endOfDay = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate() + 1,
    );

    const systemAccounts = await this.ledgerService.getSystemAccounts();
    let totalSystemBalance = 0;
    for (const acc of systemAccounts) {
      const balance = await this.ledgerService.getBalance(acc.id);
      totalSystemBalance += balance;
    }

    const transactions = Array.from(this.operationStore.values())
      .filter(
        (op) => op.created_at >= startOfDay && op.created_at < endOfDay,
      )
      .map((op) => ({
        emi_reference: op.operation_id,
        operation_type: op.operation_type,
        amount: op.amount,
        status: op.status,
        timestamp: op.created_at,
      }));

    return {
      report_date: dateStr,
      trust_account_balance: Math.abs(totalSystemBalance),
      transit_account_balance: 0,
      currency: 'MAD',
      transactions,
    };
  }
}
