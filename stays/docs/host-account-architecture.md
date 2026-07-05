# Host Account Architecture

## Overview

HOST is a first-class service account in the unified account system. A CONSUMER can apply to become a host on Nexa Stays. The HOST account shares the same human identity (UnifiedIdentity) as the CONSUMER. Identity verification is reused where policy allows.

---

## HOST Lifecycle (Separated)

### 1. Identity Reuse

| Step | Description |
|------|-------------|
| **Prerequisite** | Applicant has CONSUMER (or will create via findOrCreateForKyc) |
| **Identity verification** | KycReuseService.useExistingKyc(identityId, 'HOST') – Can reuse CONSUMER KYC if approved |
| **Policy** | HOST allowsReuse: true, requiresStepUpVerification: false |
| **Result** | Identity verified for host application without re-submitting documents |

Identity verification is **separate** from host application approval. Applicant may have identity verified (as consumer) before applying to host, or submit identity as part of host flow if not yet verified.

### 2. Host Application Approval

| Step | Description |
|------|-------------|
| **Submit** | CONSUMER calls POST /stays/host/apply with hosting_policies_accepted: true |
| **Application** | host_applications row created; status PENDING or UNDER_REVIEW |
| **Admin approves** | POST /admin/stays/host-applications/:id/approve |
| **Actions** | ensureRoleAccount(HOST), StaysHostProfile created, host_verification_status set |
| **Result** | HOST User exists; host can access host endpoints |

Host application approval creates the HOST account. It does **not** grant listing publication rights by itself.

### 3. Listing Approval

| Step | Description |
|------|-------------|
| **Prerequisite** | Host must be APPROVED (host_verification_status) |
| **Create listing** | Host creates stays_listings row |
| **Listing verification** | Property details, media, address – administered separately |
| **Publish** | Listing approved → visible to guests |

Listing approval is **separate** from host approval. A host can be approved but have no publishable listings until each listing is verified.

---

## Business Rules

- One HOST per UnifiedIdentity (uniq_host_per_unified_identity)
- Host must be same human identity as consumer
- Shared identity/profile/KYC reused where allowed
- Host-specific: application status, listing verification
- Payouts → CONSUMER wallet via getConsumerForIdentity(unified_identity_id)

---

## Endpoint Notes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /stays/host/apply | CONSUMER JWT | Submit host application |
| GET | /stays/host/application/status | JWT | Get application status |
| GET | /stays/host/listings | CONSUMER or HOST | Host's listings |
| POST | /stays/host/listings | CONSUMER or HOST | Create listing |
| GET | /stays/host/verification | CONSUMER or HOST | Host verification status |
| POST | /admin/stays/host-applications/:id/approve | ADMIN | Approve → create HOST |

---

## Status Domains

| Domain | Location | Values |
|--------|----------|--------|
| Host application | host_applications.status | PENDING, UNDER_REVIEW, APPROVED, REJECTED |
| Host verification | stays_host_profiles.host_verification_status | PENDING, APPROVED, REJECTED |
| Listing | stays_listings | Per-listing verification |

---

## File Reference

| Path | Purpose |
|------|---------|
| host-applications.service.ts | Submit, approve, reject |
| migration 027 | host_applications table |
| migration 028 | uniq_host_per_unified_identity |
