# Profile Sync Architecture

## Overview

The Nexa ecosystem uses explicit field-level sync rules to propagate shared profile data across services (Pay, Go, Stays, Driver) while keeping service-specific data local. See **profile-ownership-rules.md** for cache vs source-of-truth details.

**Principles:**
- **UnifiedIdentity** is the canonical source for shared human profile fields
- User rows may cache shared fields for performance; updates always write to UnifiedIdentity first
- getMe reads shared fields from UnifiedIdentity when linked; User cache used only for legacy
- Shared field updates propagate to UnifiedIdentity, then to linked User rows (cached fields only)
- Service-specific fields never overwrite global data
- Sensitive identity fields only change through verification flows (KYC)
- Important changes are auditable

## Shared vs Service-Specific Fields

### Shared Fields (sync across apps)

| Field | source_of_truth | writable_from | requires_verification | conflict_strategy | audit_required |
|-------|-----------------|---------------|------------------------|-------------------|----------------|
| full_name | UNIFIED_IDENTITY | All | ✅ | VERIFIED_WINS | ✅ |
| email | UNIFIED_IDENTITY | All | ❌ | LATEST_WINS | ✅ |
| date_of_birth | UNIFIED_IDENTITY | All | ✅ | VERIFIED_WINS | ✅ |
| city | UNIFIED_IDENTITY | All | ❌ | LATEST_WINS | ❌ |
| address | UNIFIED_IDENTITY | All | ❌ | LATEST_WINS | ❌ |
| profile_photo_url | UNIFIED_IDENTITY | All | ❌ | LATEST_WINS | ✅ |
| preferred_language | UNIFIED_IDENTITY | All | ❌ | LATEST_WINS | ❌ |

### Service-Specific Fields (never sync)

- wallet_balance
- payment_methods
- rides_history
- stays_bookings
- host_settings
- vehicle_details
- driver_documents
- insurance
- background_checks
- payout_methods
- kyc_status (per-user; verification flows only)
- profile_locked_at
- linked_user_id
- risk_score
- last_login_at

## Conflict Resolution

| Strategy | Behavior |
|----------|----------|
| UNIFIED_WINS | Always apply incoming; overwrite local |
| LATEST_WINS | Apply (simplified; full timestamp compare can be added) |
| VERIFIED_WINS | Apply only if identity is KYC-verified; else skip |
| NO_OVERWRITE | Never overwrite existing non-null value |
| MANUAL_RESOLVE | Skip; flag for admin resolution |

- **full_name**, **date_of_birth**: VERIFIED_WINS – locked after KYC; only verified value overwrites
- **email**, **city**, **address**, **profile_photo_url**, **preferred_language**: LATEST_WINS

## Sync Flow

1. User updates profile via any app (e.g. PATCH /users/me)
2. `UsersService.updateProfile` receives the payload
3. If `user.unified_identity_id` exists:
   - `ProfileSyncService.updateSharedProfile` runs with shared fields
   - Validates `writable_from_services`, `requires_verification` (locked fields)
   - Applies conflict resolution per field
   - Writes to `UnifiedIdentity`
   - Propagates to all linked `User` rows
   - Audits changes for `audit_required` fields
4. If no `unified_identity_id` (legacy): updates `User` directly
5. `nationality` (User-only) is always updated on the current user

## Audit Logging Design

- **Action**: `PROFILE_SYNC_UPDATE`
- **Target**: `unified_identity`, `targetId` = `unified_identity_id`
- **Metadata**: `{ field, service, unifiedIdentityId }`
- **Actor**: `actorUserId` (the user who made the change)
- **When**: For fields with `audit_required: true` (full_name, email, date_of_birth, profile_photo_url)

`AuditService.audit()` is called per updated field that requires audit. Existing `AuditLog` schema supports this.

## File Reference

| Path | Purpose |
|------|---------|
| `profile-sync-policy.ts` | Field-level rules, conflict strategies |
| `profile-sync.service.ts` | Sync logic, propagation, conflict resolution |
| `users.service.ts` | Integration in `updateProfile` |
