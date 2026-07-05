# Unified Identity Architecture

## Overview

The Nexa ecosystem uses **UnifiedIdentity** as the canonical root for human identity across all services (Nexa Pay, Nexa Go, Nexa Stays, Nexa Driver, and future services). UnifiedIdentity is the structural base; CONSUMER is one service account among many.

**Principles:**
- UnifiedIdentity is the root entity for a human person
- One phone number = one unified identity
- All service accounts (User rows) attach directly to unified_identity_id
- CONSUMER, DRIVER, COURIER, HOST, MERCHANT are peers—none structurally depends on another
- Shared user data (name, email, KYC status, etc.) lives on UnifiedIdentity

## Entity Model

### UnifiedIdentity

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| phone_number | VARCHAR(20) | Unique; natural key |
| full_name | VARCHAR(255) | Shared profile name |
| email | VARCHAR(255) | Shared email |
| date_of_birth | DATE | Shared DOB |
| city | VARCHAR(100) | City |
| address | TEXT | Address |
| profile_photo_url | VARCHAR(500) | Profile image URL |
| preferred_language | VARCHAR(10) | e.g. en, fr |
| identity_verified | BOOLEAN | KYC passed |
| kyc_status | VARCHAR(20) | PENDING, APPROVED, VERIFIED (legacy) |
| identity_verification_status | VARCHAR(30) | NOT_STARTED, PENDING, UNDER_REVIEW, APPROVED, REJECTED, EXPIRED (see kyc-onboarding-status-domains.md) |
| kyc_level | VARCHAR(20) | Optional KYC tier |
| account_status | VARCHAR(20) | ACTIVE, SUSPENDED, etc. |
| linked_services | JSONB | Array of account types: CONSUMER, DRIVER, COURIER, MERCHANT |
| created_at, updated_at | TIMESTAMP | Audit fields |

### Relationships

```
UnifiedIdentity (1) ─────< (N) User (service accounts)
     │
     └── Canonical root for human identity
     └── User.unified_identity_id (FK)
     └── One identity per phone
```

- **User** has `unified_identity_id` → **UnifiedIdentity** (primary linkage)
- Multiple User rows (CONSUMER, DRIVER, COURIER, HOST, MERCHANT) attach to one UnifiedIdentity
- No structural dependency on CONSUMER; role resolution via identity (getConsumerForIdentity, findByUnifiedIdentityIdAndAccountType)
- Service-specific profiles (DriverProfile, CourierProfile, etc.) remain linked to User

## Service Profiles

| Profile | Links to | Service |
|---------|----------|---------|
| PayProfile / Wallet | User (CONSUMER) | Nexa Pay |
| GoRiderProfile | User (CONSUMER) | Nexa Go |
| DriverProfile | User (DRIVER) | Nexa Driver |
| CourierProfile | User (COURIER) | Nexa Driver / Delivery |
| StaysGuestProfile | User (CONSUMER) | Nexa Stays |
| StaysHostProfile | User (HOST) | Nexa Stays |
| Merchant | User (MERCHANT) | Go Delivery / POS |

All link via `User`; User links to UnifiedIdentity. **UnifiedIdentity → User → Service Profiles**.

**CONSUMER**: Exactly one per UnifiedIdentity. Pay, Go rider, Stays guest share the same CONSUMER. See [consumer-data-ownership.md](./consumer-data-ownership.md). Uniqueness: `uniq_consumer_per_unified_identity`, `uniq_consumer_per_phone` (migration 026).

**HOST**: One per UnifiedIdentity. Apply from CONSUMER; payouts to CONSUMER wallet. See [host-account-architecture.md](./host-account-architecture.md). Uniqueness: `uniq_host_per_unified_identity` (migration 028).

## Service Layer

### UnifiedIdentityService

- **findOrCreateByPhone(phoneNumber)** – Ensures an identity exists for the phone; creates from existing users if needed; links all users with that phone
- **findById(id)** – Read-only lookup by identity id
- **getProfileByPhone(phoneNumber)** – Returns shared profile from UnifiedIdentity (or null if none)
- **findByPhone(phoneNumber)** – Read-only lookup
- **refreshLinkedServices(identityId)** – Refreshes linked_services from attached users
- **updateKycStatus(unifiedIdentityId, identityVerified, kycStatus)** – Updates KYC state; called by KycReuseService.syncFromKycApproval

### UsersService Integration

- **getNexaProfileByPhone(phone)** – Uses UnifiedIdentity when present; falls back to legacy user-based aggregation when not (migration-safe)
- **createUser**, **findOrCreateForKyc** – Call `findOrCreateByPhone` after creating users to link them to unified identity
- **createRoleAccount** – Requires `unified_identity_id`; validates phone match; no CONSUMER dependency
- **getConsumerForIdentity(identityId)** – Resolves CONSUMER for payouts
- **findByUnifiedIdentityIdAndAccountType(identityId, accountType)** – Role lookup via identity

## Migration Strategy

1. **Migration 024** – Creates `unified_identities` table, adds `unified_identity_id` to `users`, backfills one identity per distinct phone, links users
2. **Backfill logic** – Prefers CONSUMER user for profile data; aggregates `linked_services` from all users per phone
3. **Nullability** – `unified_identity_id` is nullable; legacy flows continue to work
4. **Profile lookup** – Tries UnifiedIdentity first; falls back to user-based logic when identity is null

## Running the Migration

```bash
# Via Docker
docker exec -i <postgres_container> psql -U <user> -d <db> < backend/database/migrations/024_unified_identity.sql

# Or via your migration runner
```

## Profile Sync

Field-level sync rules and conflict resolution. See [profile-sync-architecture.md](./profile-sync-architecture.md).

## Reusable KYC

Identity verification completed in one service can be reused in another when policy allows. See [reusable-kyc-architecture.md](./reusable-kyc-architecture.md).

## Driver Onboarding

Driver and Courier registration use unified identity, reusable KYC, and profile sync. See [driver-onboarding-unified-identity.md](./driver-onboarding-unified-identity.md).

## Consumer Data Ownership

| Document | Purpose |
|----------|---------|
| [consumer-data-ownership.md](./consumer-data-ownership.md) | Shared vs service-specific data (Pay / Go rider / Stays guest) |

## File Reference

| Path | Purpose |
|------|---------|
| `entities/unified-identity.entity.ts` | UnifiedIdentity entity |
| `entities/user.entity.ts` | User entity with unified_identity_id |
| `unified-identity.service.ts` | UnifiedIdentityService |
| `users.service.ts` | Integration with getNexaProfileByPhone, create flows |
| `database/migrations/024_unified_identity.sql` | Migration and backfill |
