# Unified Account System: Legacy Retirement Roadmap

Deprecation notes and removal path for transitional fields and legacy flows.

---

## Deprecated Fields

### 1. `unified_identities.phone_number`

| Status | Deprecated | Transitional |
|--------|------------|--------------|
| **Canonical source** | identity_phone_numbers | unified_identities.phone_number |

**Guidance:**
- All new lookups: use `IdentityPhoneNumbersService.findIdentityByPhone(raw)` first.
- Fallback to `unified_identities.phone_number` only for migration/legacy.
- **Removal path:** After full backfill of identity_phone_numbers and code migration to identity-first lookup, make nullable and stop writing. Eventually drop column.

---

### 2. `users.phone_number` (as canonical login identifier)

| Status | Transitional |
|--------|--------------|
| **Canonical source** | identity_phone_numbers (via identity_id) |

**Guidance:**
- User.phone_number kept for display and consistency; must match identity.
- Auth lookups (findAccountsByPhone, findConsumerByPhone) currently use users.phone_number. Target: resolve identity via identity_phone_numbers first, then users by unified_identity_id.
- **Removal path:** Not planned. Keep for display; migrate auth to identity-first resolution.

---

### 3. `users.linked_user_id`

| Status | **Deprecated** |
|--------|----------------|
| **Replacement** | `getConsumerForIdentity(unified_identity_id)` |

**Guidance:**
- New role accounts: leave `linked_user_id` null. Payout resolution uses identity.
- DRIVER, COURIER, HOST: use `roleUsesConsumerForPayout()` → `getConsumerForIdentity`.
- MERCHANT: excluded; no consumer link for payout.
- **Removal path:**
  1. Ensure all payout flows use `getConsumerForIdentity`.
  2. Stop writing `linked_user_id` in new role creation.
  3. Backfill: set `linked_user_id = getConsumerForIdentity(...)` for legacy rows (optional, for compat).
  4. Add migration to drop column once all consumers are identity-first and no code reads it.

---

### 4. `unified_identities.linked_services`

| Status | **Derived, non-authoritative** |
|--------|-------------------------------|
| **Source of truth** | User rows (query by unified_identity_id) |

**Guidance:**
- Do not treat as source of truth. Refreshed by `refreshLinkedServices` when users change.
- For "what accounts does this identity have?" → `findByUnifiedIdentityId` or equivalent.
- **Removal path:** Optional. Could keep as cached view for performance. If removed, drop column and always query users.

---

### 5. `unified_identities.kyc_status` / `users.kyc_status`

| Status | Transitional |
|--------|--------------|
| **Canonical** | identity_verification_status, ReusableIdentityVerification.verification_status |

**Guidance:**
- API responses still return `kyc_status` for backward compat.
- New logic: prefer `identity_verification_status` (UnifiedIdentity) and `verification_status` (ReusableIdentityVerification).
- **Removal path:** Long-term. Keep until clients migrate. See kyc-onboarding-status-domains.md.

---

## Legacy Flows

### Auth: Phone-first vs Identity-first

| Current | Target |
|---------|--------|
| findAccountsByPhone(phone) → users.phone_number | Resolve identity via findIdentityByPhone → users by unified_identity_id |
| findConsumerByPhone(phone) → users.phone_number | Same; resolve identity first |
| PIN verify: phone + account_type → User by phone | Identity-first: phone → identity → User by identity + account_type |

**Migration:** Add `findAccountsByIdentity(identityId)`, use in auth when identity is known. Gradually switch OTP flow to resolve identity first, then accounts.

### Payout resolution

| Current | Target |
|---------|--------|
| user.linked_user_id (if set) | getConsumerForIdentity(unified_identity_id) |
| Fallback to linked_user | Remove fallback once migration complete |

---

## Retirement Phases

| Phase | Scope | Actions |
|-------|-------|---------|
| **1 (Current)** | Deprecation markers | Mark linked_user_id, legacy phone fields; document canonical sources |
| **2** | Auth identity-first | Implement findAccountsByIdentity; use in OTP/PIN when identity known |
| **3** | linked_user_id | Stop writing; migrate all reads to getConsumerForIdentity; drop column |
| **4** | linked_services | Decide: keep as cache or drop and query users |
| **5** | phone_number fields | After identity_phone_numbers backfill: stop writing unified_identities.phone_number; make nullable |

---

## File Reference

| Path | Purpose |
|------|---------|
| `users.service.ts` | getConsumerForIdentity, roleUsesConsumerForPayout |
| `auth.service.ts` | findAccountsByPhone, findConsumerByPhone, verifyPin |
| `unified-identity.service.ts` | findIdentityByPhoneOrLegacy, refreshLinkedServices |
