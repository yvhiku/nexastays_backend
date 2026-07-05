# Onboarding Flow Refactor

## Overview

Refactored so a CONSUMER can apply to become DRIVER, COURIER, or HOST under the same UnifiedIdentity without conflicts or duplicate identities.

---

## Business Rules

- Person signs up once as CONSUMER.
- Later can apply to become DRIVER, COURIER, and/or HOST.
- Each approved role becomes its own service account under the same UnifiedIdentity.
- Shared identity/profile is not duplicated.
- Role-specific onboarding data remains isolated.

---

## Changes

### 1. Idempotent Role Creation

**`UsersService.ensureRoleAccount(payload)`**
- Returns existing role user if found; otherwise creates.
- Use in approval flows instead of `createRoleAccount`.
- `createRoleAccount` still throws when role exists (for explicit create cases).

### 2. Unique Constraints (Migration 029)

- `uniq_driver_per_unified_identity`: one DRIVER per `unified_identity_id`
- `uniq_courier_per_unified_identity`: one COURIER per `unified_identity_id`

(Existing: `uniq_consumer_per_unified_identity`, `uniq_host_per_unified_identity`)

### 3. Unified Flow

| Step | Action |
|------|--------|
| 1 | `findOrCreateByPhone(phone)` → identity (no duplicate) |
| 2 | `findOrCreateForKyc(phone)` → CONSUMER (for payout) |
| 3 | `ensureRoleAccount({ unified_identity_id, account_type, ... })` → role user |
| 4 | Ensure role-specific profile (DriverProfile, StaysHostProfile) |

CONSUMER is not the structural root; identity is. CONSUMER is ensured for payout resolution (DRIVER/COURIER/HOST receive payouts to CONSUMER wallet).

### 4. Concurrency Safety

**Approval flows:**
- `SELECT ... FOR UPDATE` on application row at start of approval.
- Status check and update run inside transaction; second concurrent approval blocks until first commits, then sees APPROVED and fails.

**Role creation:**
- `ensureRoleAccount` is idempotent.
- Unique constraints prevent duplicate role rows at DB level.

### 5. Role-Specific Documents

| Role | Documents |
|------|-----------|
| DRIVER | Vehicle (photos, registration, insurance), driver license, background check |
| COURIER | Identity (or reuse); delivery onboarding if required |
| HOST | Host verification (or reuse identity); property docs per listing |

### 6. getMe Linked User

`getMe` now resolves `linked_user` (CONSUMER) for HOST as well as DRIVER and COURIER.

---

## Migration / Compatibility

| Migration | Purpose |
|-----------|---------|
| 029 | Add unique indexes for DRIVER and COURIER per identity |

**Pre-check** (if migration fails):
```sql
SELECT unified_identity_id, account_type, count(*)
FROM users
WHERE account_type IN ('DRIVER', 'COURIER') AND unified_identity_id IS NOT NULL
GROUP BY unified_identity_id, account_type HAVING count(*) > 1;
```

Resolve duplicates before re-running.

---

## File Reference

| Path | Change |
|------|--------|
| users.service.ts | `ensureRoleAccount`, `doCreateRoleAccount`; getMe includes HOST for linked_user |
| registration-applications.service.ts | Use `ensureRoleAccount`; FOR UPDATE on approve |
| host-applications.service.ts | Use `ensureRoleAccount`; FOR UPDATE on approve |
| migration 029 | DRIVER/COURIER unique constraints |
