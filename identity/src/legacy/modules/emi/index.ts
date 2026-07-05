/**
 * EMI Integration Module - Public API
 *
 * This is the main export file for the EMI module.
 * Other modules should import from here.
 */

export { EMIModule } from './emi.module';
export type { EMIModuleOptions, EMIProviderType } from './emi.module';

export { EMIService } from './emi.service';

export { EMI_PROVIDER, EMIProviderBase } from './emi.interface';
export type { IEMIProvider } from './emi.interface';

export { EMIMockProvider } from './emi.mock.provider';

export {
  EMIOperationType,
  EMIOperationStatus,
  EMISettlementType,
} from './emi.types';

export type {
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
