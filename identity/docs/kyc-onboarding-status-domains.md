# KYC and Onboarding Status Domains

This document defines the separation between **person-level identity verification**, **reusable verification artifacts**, **service account status**, and **role onboarding status**.

## Status Domains

### 1. Identity Verification Status (person-level)

**Location:** `unified_identities.identity_verification_status`

**Purpose:** Person-level identity verification. "Is this human who they claim to be?"

| Value | Meaning |
|-------|---------|
| NOT_STARTED | No identity documents submitted |
| PENDING | Documents submitted, awaiting review |
| UNDER_REVIEW | In manual/automated review |
| APPROVED | Identity verified (documents + selfie) |
| REJECTED | Verification failed |
| EXPIRED | Document expired, re-verification needed |

**Source of truth:** Synced from `ReusableIdentityVerification` on KYC approval. `kyc_status` (legacy) is kept for backward compatibility.

---

### 2. Verification Artifact Status (ReusableIdentityVerification)

**Location:** `reusable_identity_verifications.verification_status`

**Purpose:** Status of the reusable KYC snapshot/artifact. Only `APPROVED` + non-expired = reusable.

| Value | Meaning |
|-------|---------|
| NOT_STARTED | No reusable verification created |
| PENDING | Pending review |
| UNDER_REVIEW | In review |
| APPROVED | Verified; can be reused (maps from legacy VERIFIED) |
| REJECTED | Rejected |
| EXPIRED | Document expired |

**Reuse rules:**
- Consumer identity verification is reusable for Host, Driver, Courier where policy allows
- Driver still requires step-up: vehicle, license, etc.
- Host may require property/compliance-specific checks
- See `kyc-reuse-policy.ts` for per-service policy

---

### 3. Service Account Status (operational)

**Location:** `users.status`

**Purpose:** Operational status of a service account. "Can this account transact?"

| Value | Meaning |
|-------|---------|
| PENDING | Account created but not yet active |
| ACTIVE | Can transact |
| SUSPENDED | Temporarily suspended |
| REJECTED | Permanently rejected |
| DISABLED | Admin-disabled |
| FROZEN | Frozen (e.g. compliance) |
| DELETION_PENDING | Awaiting deletion |

---

### 4. Onboarding Status (role/service)

**Location:**
- `host_applications.status`
- `go.registration_applications.status` (driver/courier)
- `stays_host_profiles.host_verification_status` (host verification)

**Purpose:** Application/approval workflow for a role.

| Value | Meaning |
|-------|---------|
| APPLICATION_SUBMITTED | Application submitted (or PENDING) |
| DOCUMENTS_REQUIRED | Additional documents needed |
| UNDER_REVIEW | In review |
| APPROVED | Role granted; can operate |
| REJECTED | Application rejected |

**Host:** `host_verification_status` = PENDING (under review), APPROVED (can list), REJECTED.

**Driver/Courier:** `go.registration_applications.status` = PENDING, UNDER_REVIEW, APPROVED, REJECTED.

---

## Lifecycle by Role

### Consumer
1. Register → `users.status` = ACTIVE
2. Submit KYC → `kyc_profiles.status` = PENDING
3. Admin approves → `ReusableIdentityVerification` created/updated, `UnifiedIdentity.identity_verification_status` = APPROVED
4. Identity verification reusable for Host/Driver/Courier

### Host
1. Must have identity verified (consumer KYC approved) or submit host-specific documents
2. `host_applications` submitted → status PENDING
3. Admin approves → HOST User + `stays_host_profiles` created, `host_verification_status` = APPROVED
4. `host_verification_status` = onboarding status (can list vs cannot list)

### Driver
1. Submit `go.registration_applications` (identity + vehicle docs)
2. Identity can be reused from consumer KYC; step-up: license, vehicle, insurance
3. Admin approves → DRIVER User created
4. `users.status` = ACTIVE = can operate

### Courier
1. Similar to driver; step-up may be lighter
2. `go.registration_applications` or direct onboarding
3. `users.status` = ACTIVE = can operate

### Merchant
1. Separate onboarding; typically one MERCHANT per UnifiedIdentity
2. `users.status` = ACTIVE = can receive payouts

---

## Backward Compatibility

- `unified_identities.kyc_status` and `users.kyc_status` are **kept**; API responses still return `kyc_status` (PENDING, APPROVED, VERIFIED, REJECTED).
- `identity_verification_status` is the new source; `kyc_status` is derived/written for compat.
- `reusable_identity_verifications.kyc_status` kept; `verification_status` added. Code accepts both `verification_status === 'APPROVED'` and `kyc_status === 'VERIFIED'`.
- Clients checking `kyc_status === 'APPROVED' || kyc_status === 'VERIFIED'` continue to work.

---

## Migration

Run `031_kyc_onboarding_status_domains.sql` after `030_unified_account_constraints.sql`.

```bash
./local/run-migrations.sh
```

---

## Files

| Path | Purpose |
|------|---------|
| `common/enums/verification-status.enum.ts` | TypeScript enums and mappers |
| `entities/unified-identity.entity.ts` | identity_verification_status |
| `entities/reusable-identity-verification.entity.ts` | verification_status |
| `unified-identity.service.ts` | Syncs identity_verification_status |
| `kyc-reuse.service.ts` | Uses verification_status / kyc_status |
