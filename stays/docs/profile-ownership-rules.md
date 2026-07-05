# Profile Ownership Rules

## Source of Truth

**UnifiedIdentity** is the canonical source for shared human profile fields. Service accounts (User rows) must not independently own these fields; any cached copies are strictly derived.

## Shared Human Fields

| Field | Source of Truth | Cached on User? | Notes |
|-------|-----------------|-----------------|-------|
| full_name | UnifiedIdentity | Yes | Locked after KYC; VERIFIED_WINS |
| email | UnifiedIdentity | Yes | LATEST_WINS |
| date_of_birth | UnifiedIdentity | Yes | Locked after KYC; VERIFIED_WINS |
| city | UnifiedIdentity | Yes | LATEST_WINS |
| address | UnifiedIdentity | No | Identity-only; read from identity |
| profile_photo_url | UnifiedIdentity | Yes | LATEST_WINS |
| preferred_language | UnifiedIdentity | No | Identity-only; read from identity |

## Service-Specific Fields (Never Synced)

- nationality (per-account; KYC context)
- profile_locked_at
- kyc_status
- linked_user_id
- risk_score, last_login_at
- wallet, rides, bookings, host settings, vehicle details, etc.

## Cache vs Source-of-Truth

- **Cached fields (User):** full_name, email, date_of_birth, city, profile_photo_url  
  - Denormalized for performance (e.g. listings, transactions)
  - Propagated from UnifiedIdentity on update
  - **Read path:** getMe prefers UnifiedIdentity when `unified_identity_id` exists; falls back to User for legacy
- **Identity-only fields:** address, preferred_language  
  - User has no columns; always read from UnifiedIdentity
  - PATCH /users/me writes to UnifiedIdentity via ProfileSyncService

## Verified / Locked Fields

- **full_name**, **date_of_birth**: Locked when `profile_locked_at` set or KYC approved
- Cannot be casually overwritten; only admin/support flows may update
- `requires_verification: true` in sync rules; `VERIFIED_WINS` conflict strategy

## Propagation Flow

1. PATCH /users/me or uploadProfilePhoto → `UsersService.updateProfile` / profile sync
2. `ProfileSyncService.updateSharedProfile`:
   - Validates writable_from_services, locked fields
   - Applies conflict resolution
   - Writes to **UnifiedIdentity**
   - Propagates to linked User rows (cached fields only)
3. getMe: loads User + UnifiedIdentity (when linked); returns shared fields from **UnifiedIdentity**; User cache used only for legacy or fallback

## Audit

- **PROFILE_SYNC_UPDATE** for full_name, email, date_of_birth, profile_photo_url
- Metadata: field, service, unifiedIdentityId

## Versioning / Snapshot (Optional)

For future use: `unified_identities.updated_at` provides a simple version marker. A full audit trail exists via AuditLog. Snapshot tables (e.g. `profile_snapshots`) could be added if point-in-time recovery or compliance history is required.
