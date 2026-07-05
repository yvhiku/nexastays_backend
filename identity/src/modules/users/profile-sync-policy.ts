/**
 * Profile Sync Policy – field-level rules for data sync across Nexa services.
 * UnifiedIdentity is source of truth for shared fields.
 * Service-specific fields never overwrite global data.
 */

import type { NexaService } from './nexa-services';

export type { NexaService };
export type ConflictStrategy =
  | 'UNIFIED_WINS'     // UnifiedIdentity always wins; overwrite local
  | 'LATEST_WINS'      // Most recent update wins (timestamp compare)
  | 'VERIFIED_WINS'    // KYC-verified value wins over unverified
  | 'NO_OVERWRITE'     // Never overwrite existing non-null value
  | 'MANUAL_RESOLVE';  // Flag for admin resolution

export type SharedField =
  | 'full_name'
  | 'email'
  | 'date_of_birth'
  | 'city'
  | 'address'
  | 'profile_photo_url'
  | 'preferred_language';

export interface FieldSyncRule {
  field: SharedField;
  source_of_truth: 'UNIFIED_IDENTITY';
  writable_from_services: NexaService[];
  requires_verification: boolean;
  conflict_strategy: ConflictStrategy;
  audit_required: boolean;
}

/** Shared fields: sync across Pay, Go, Stays, Driver. Source of truth = UnifiedIdentity. */
export const SHARED_FIELDS: SharedField[] = [
  'full_name',
  'email',
  'date_of_birth',
  'city',
  'address',
  'profile_photo_url',
  'preferred_language',
];

/** Fields that must remain service-specific – never sync. */
export const SERVICE_SPECIFIC_FIELDS = [
  'wallet_balance',
  'payment_methods',
  'rides_history',
  'stays_bookings',
  'host_settings',
  'vehicle_details',
  'driver_documents',
  'insurance',
  'background_checks',
  'payout_methods',
  'kyc_status',           // Per-user KYC state; verification flows only
  'profile_locked_at',    // Per-user lock from KYC
  'linked_user_id',       // Role linking
  'risk_score',
  'last_login_at',
] as const;

export const PROFILE_SYNC_RULES: Record<SharedField, FieldSyncRule> = {
  full_name: {
    field: 'full_name',
    source_of_truth: 'UNIFIED_IDENTITY',
    writable_from_services: ['PAY', 'GO', 'STAYS', 'DRIVER', 'COURIER', 'HOST', 'MERCHANT'],
    requires_verification: true,  // Locked after KYC
    conflict_strategy: 'VERIFIED_WINS',
    audit_required: true,
  },
  email: {
    field: 'email',
    source_of_truth: 'UNIFIED_IDENTITY',
    writable_from_services: ['PAY', 'GO', 'STAYS', 'DRIVER', 'COURIER', 'HOST', 'MERCHANT'],
    requires_verification: false,
    conflict_strategy: 'LATEST_WINS',
    audit_required: true,
  },
  date_of_birth: {
    field: 'date_of_birth',
    source_of_truth: 'UNIFIED_IDENTITY',
    writable_from_services: ['PAY', 'GO', 'STAYS', 'DRIVER', 'COURIER', 'HOST', 'MERCHANT'],
    requires_verification: true,
    conflict_strategy: 'VERIFIED_WINS',
    audit_required: true,
  },
  city: {
    field: 'city',
    source_of_truth: 'UNIFIED_IDENTITY',
    writable_from_services: ['PAY', 'GO', 'STAYS', 'DRIVER', 'COURIER', 'HOST', 'MERCHANT'],
    requires_verification: false,
    conflict_strategy: 'LATEST_WINS',
    audit_required: false,
  },
  address: {
    field: 'address',
    source_of_truth: 'UNIFIED_IDENTITY',
    writable_from_services: ['PAY', 'GO', 'STAYS', 'DRIVER', 'COURIER', 'HOST', 'MERCHANT'],
    requires_verification: false,
    conflict_strategy: 'LATEST_WINS',
    audit_required: false,
  },
  profile_photo_url: {
    field: 'profile_photo_url',
    source_of_truth: 'UNIFIED_IDENTITY',
    writable_from_services: ['PAY', 'GO', 'STAYS', 'DRIVER', 'COURIER', 'HOST', 'MERCHANT'],
    requires_verification: false,
    conflict_strategy: 'LATEST_WINS',
    audit_required: true,
  },
  preferred_language: {
    field: 'preferred_language',
    source_of_truth: 'UNIFIED_IDENTITY',
    writable_from_services: ['PAY', 'GO', 'STAYS', 'DRIVER', 'COURIER', 'HOST', 'MERCHANT'],
    requires_verification: false,
    conflict_strategy: 'LATEST_WINS',
    audit_required: false,
  },
};

export function getFieldRule(field: SharedField): FieldSyncRule {
  return PROFILE_SYNC_RULES[field];
}

export function isSharedField(field: string): field is SharedField {
  return SHARED_FIELDS.includes(field as SharedField);
}

export function canWriteFromService(
  field: SharedField,
  service: NexaService,
): boolean {
  return PROFILE_SYNC_RULES[field].writable_from_services.includes(service);
}

/** Map account_type to primary NexaService for sync context. */
export function accountTypeToService(accountType: string): NexaService {
  const t = (accountType ?? 'CONSUMER').toUpperCase();
  if (t === 'DRIVER') return 'DRIVER';
  if (t === 'COURIER') return 'COURIER';
  if (t === 'HOST') return 'HOST';
  if (t === 'MERCHANT') return 'MERCHANT';
  return 'PAY';
}
