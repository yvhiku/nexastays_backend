/**
 * Service-level KYC reuse policy.
 * Each Nexa service defines its own minimum requirements and step-up rules.
 */

import type { NexaService } from './nexa-services';

export type { NexaService };
export interface ServiceKycPolicy {
  /** Service identifier */
  service: NexaService;
  /** Allows reusing identity verification from another service */
  allowsReuse: boolean;
  /** Minimum verification level required (null = any) */
  minVerificationLevel: string | null;
  /** Accepted document types (null = any) */
  acceptedDocumentTypes: string[] | null;
  /** Requires step-up verification (e.g. driver license, vehicle docs) */
  requiresStepUpVerification: boolean;
  /** Can prefill identity data as read-only even when step-up required */
  canPrefillIdentityReadonly: boolean;
}

export const SERVICE_KYC_POLICIES: Record<NexaService, ServiceKycPolicy> = {
  PAY: {
    service: 'PAY',
    allowsReuse: true,
    minVerificationLevel: null,
    acceptedDocumentTypes: null,
    requiresStepUpVerification: false,
    canPrefillIdentityReadonly: true,
  },
  GO: {
    service: 'GO',
    allowsReuse: true,
    minVerificationLevel: null,
    acceptedDocumentTypes: null,
    requiresStepUpVerification: false,
    canPrefillIdentityReadonly: true,
  },
  STAYS: {
    service: 'STAYS',
    allowsReuse: true,
    minVerificationLevel: null,
    acceptedDocumentTypes: null,
    requiresStepUpVerification: false,
    canPrefillIdentityReadonly: true,
  },
  COURIER: {
    service: 'COURIER',
    allowsReuse: true,
    minVerificationLevel: null,
    acceptedDocumentTypes: null,
    requiresStepUpVerification: false,
    canPrefillIdentityReadonly: true,
  },
  DRIVER: {
    service: 'DRIVER',
    allowsReuse: true,
    minVerificationLevel: null,
    acceptedDocumentTypes: null,
    requiresStepUpVerification: true,
    canPrefillIdentityReadonly: true,
  },
  HOST: {
    service: 'HOST',
    allowsReuse: true,
    minVerificationLevel: null,
    acceptedDocumentTypes: null,
    requiresStepUpVerification: false,
    canPrefillIdentityReadonly: true,
  },
  MERCHANT: {
    service: 'MERCHANT',
    allowsReuse: true,
    minVerificationLevel: null,
    acceptedDocumentTypes: null,
    requiresStepUpVerification: false,
    canPrefillIdentityReadonly: true,
  },
};

export function getServicePolicy(service: NexaService): ServiceKycPolicy {
  return SERVICE_KYC_POLICIES[service];
}
