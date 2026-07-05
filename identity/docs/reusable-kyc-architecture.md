# Reusable KYC Architecture

## Overview

Reusable identity verification allows KYC completed in one Nexa service (e.g. Nexa Pay) to be reused when the user onboards another service (e.g. Nexa Go, Courier) when policy allows. This avoids duplicate identity verification while preserving service-specific requirements (e.g. driver license, vehicle docs).

**Principles:**
- **Identity verification is separate from service onboarding** – Person-level KYC (who is this human?) is reusable. Service onboarding (vehicle, host docs, listing approval) is separate.
- Only **VERIFIED** / **APPROVED** KYC can be reused
- Document must not be **expired**
- Each service defines its own minimum requirements
- Some services require step-up verification (driver)

---

## Status Domains (Normalized)

| Domain | Location | Purpose |
|--------|----------|---------|
| **Identity verification** | unified_identities.identity_verification_status | Person-level: NOT_STARTED, PENDING, APPROVED, REJECTED, EXPIRED |
| **Verification artifact** | reusable_identity_verifications.verification_status | Reusable KYC snapshot: APPROVED = reusable |
| **Service account** | users.status | Operational: ACTIVE, SUSPENDED, etc. |
| **Onboarding** | host_applications.status, registration_applications.status | Application workflow |

See `kyc-onboarding-status-domains.md` for full domain definitions.

---

## Data Model

### ReusableIdentityVerification

Linked to `UnifiedIdentity` (one per identity). Stores the reusable KYC snapshot.

| Field | Purpose |
|-------|---------|
| unified_identity_id | FK to unified_identities (unique) |
| verification_status | APPROVED = reusable (canonical). kyc_status VERIFIED = legacy compat. |
| identity_verified | Identity confirmed |
| expiry_date | Document expiry; past = not reusable |
| reusable_across_services | Eligible for reuse |
| reuse_block_reason | If blocked: EXPIRED, REJECTED, etc. |

---

## Policy Design

| Service | allowsReuse | requiresStepUpVerification |
|---------|-------------|----------------------------|
| PAY, GO, STAYS, COURIER, MERCHANT | ✅ | ❌ |
| DRIVER | ✅ | ✅ (vehicle, license) |

- **Identity verification** – Shared across services.
- **Service onboarding** – Driver: vehicle, license. Host: application approval, listing verification. Merchant: profile/onboarding.

---

## Sync Flow

When admin approves KYC:

1. AdminKycService.approve() updates KycProfile and User
2. KycReuseService.syncFromKycApproval(user.phone_number, kyc)
3. Upserts ReusableIdentityVerification; updates UnifiedIdentity (identity_verified, identity_verification_status)

---

## File Reference

| Path | Purpose |
|------|---------|
| `entities/reusable-identity-verification.entity.ts` | Entity |
| `kyc-reuse-policy.ts` | Service-level policies |
| `kyc-reuse.service.ts` | Business logic |
| `kyc-onboarding-status-domains.md` | Status domain definitions |
