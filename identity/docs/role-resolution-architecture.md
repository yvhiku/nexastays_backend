# Role Resolution Architecture

## Overview

Role and account discovery uses **unified_identity_id** as the primary relationship anchor. `linked_user_id` is legacy and used only as a fallback when identity is missing.

---

## Resolution Rules

### Consumer from Driver/Courier/HOST (payout, wallet, profile)

| Primary | Fallback |
|---------|----------|
| `getConsumerForIdentity(unified_identity_id)` | `linked_user_id` when identity is null |

**Usage:** transfer-to-consumer, getMe linked_user, payout resolution.

### Driver from Consumer (role switching, driver app)

| Primary | Fallback |
|---------|----------|
| `findByUnifiedIdentityIdAndAccountType(identity_id, 'DRIVER')` | `find where linked_user_id = consumer_id` when identity is null |

**Usage:** getDriverProfileForUser when CONSUMER JWT is used in driver app.

### Role from identity

- `findByUnifiedIdentityIdAndAccountType(unified_identity_id, account_type)` — canonical lookup.

---

## Where linked_user_id Remains

| Location | Purpose | Notes |
|----------|---------|-------|
| User entity | Column kept for legacy rows | Nullable; new role accounts no longer set it |
| getMe | Fallback when unified_identity_id is null | Legacy users only |
| transferToConsumer | Fallback when identity resolution returns null | Legacy only |
| getDriverProfileForUser | Fallback when CONSUMER has no identity | Legacy only |
| admin-users.service | Reporting, `has_linked_consumer` | Display/inventory only |
| findByLinkedUserIdAndAccountType | Deprecated | No new callers; kept for compatibility |

**New role accounts:** Approval flows (DRIVER, COURIER, HOST) no longer pass `linked_user_id`. Resolution uses `getConsumerForIdentity` at runtime.

---

## Risk Notes

1. **Legacy users without unified_identity_id**: If a CONSUMER or DRIVER has no `unified_identity_id`, `linked_user_id` fallbacks still apply. Ensure migration 024 backfill has linked all users.
2. **Admin reporting**: `has_linked_consumer` reflects `linked_user_id`. New role accounts will show false until we add identity-based reporting.
3. **Authorization**: Role resolution is identity-based. Verify `unified_identity_id` is always set for post-migration users.
