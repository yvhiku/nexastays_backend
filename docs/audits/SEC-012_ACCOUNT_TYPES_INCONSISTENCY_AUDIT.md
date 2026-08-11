# SEC-012 — AccountTypes Inconsistency Audit

**Date:** 2026-08-11  
**Mode:** AUDIT ONLY — no application code changes in this pass (report document only).  
**Scope:** Nexa Stays product surface — Stays service host/authz + Identity JWT `account_type` as consumed by Stays / mobile / web guests & hosts.  
**Out of scope for deep analysis:** Identity legacy Go/taxi/delivery/wallets AccountTypeGuard usage (noted only where it explains platform enum shape); Nexa Pay; CMI; VPS; CI; migrations; SEC-008/009/010/011/013 remediation.

**Final verdict: ACCEPTED RESIDUAL RISK**

---

## 1. Executive Summary

SEC-012 is a **real consistency / footgun finding**, not a demonstrated privilege-escalation bug in the current Nexa Stays host model.

**What is true today**

- Identity defines a canonical six-value `account_type` set on `users` (DB CHECK + TS): `CONSUMER | DRIVER | COURIER | HOST | MERCHANT | ADMIN`.
- Stays **duplicates** the same six types in `stays/src/common/types/account.types.ts` (union, no shared package).
- Stays ships `AccountTypes` / `AccountTypeGuard`, but **no live Stays route uses `@AccountTypes` or registers `AccountTypeGuard`**. The decorator is an **unused import** in `stays.controller.ts`.
- **Nexa Stays host authority is not JWT `account_type === 'HOST'`.** Host capability is Stays-local: `host_profiles.application_status === 'APPROVED'` (+ listing ownership via `host_user_id === userId`). Approved hosts typically continue as Identity **`CONSUMER`** JWT subjects.
- Metadata key **differs** across services: Identity `account_types` vs Stays `accountTypes` — harmless while Stays never applies the guard; dangerous if copy-pasted incorrectly later.
- Mobile OTP / registration prefers **`CONSUMER`** account selection.

**Security impact today:** Low. No evidenced bypass of listing ownership or host-profile APPROVED checks via this inconsistency alone.

**Residual risk:** A future developer may gate Stays host APIs on JWT `HOST` (or assume Host users exist in Identity) and thereby **mis-authorize** (false denies) or, worse, **weaken** ownership checks. Docs in Stays (`auth-identity-account-refactor.md`) still describe CONSUMER+HOST multi-account JWT selection that **does not match** the live Stays host-onboarding product path.

---

## 2. SEC-012 Finding

| Field | Value |
|-------|--------|
| **ID** | SEC-012 |
| **Severity** | Low |
| **Component** | Identity enum + Stays types/guards + product/docs vs live host model |
| **Status** | **OPEN** as correctness / security-adjacent debt; **not** a current exploit path |
| **Class** | Duplication + dead Stays guard + **HOST JWT ≠ Stays host** semantic mismatch |
| **Launch blocker?** | No (security). Optional hygiene before scaling host/admin features |

---

## 3. Actual Nexa Stays Role / Account Model

```
Identity users.account_type
  └─ Stays guests & hosts (product): typically CONSUMER JWT
       └─ Stays host_profiles (application_status)
            └─ APPROVED → is_host / can_create_listing
                 └─ stays_listings.host_user_id = Identity user id
                      └─ Host APIs: ownership (host_user_id === JWT userId)
                           + profile APPROVED where required
Admin Stays: @Roles('ADMIN') + Identity authz_version (SEC-003)
```

This is **not**:

```
OTP → select Identity account_type=HOST → JWT HOST → host APIs
```

That flow appears in **Stays docs** as a multi-role identity pattern, but live host onboarding creates/updates **`host_profiles`**, not a second Identity `HOST` user row (no `createRoleAccount('HOST')` in Stays host modules).

---

## 4. Inventory — Type Definitions

| Location | Definition | Notes |
|----------|------------|--------|
| `identity/.../user.entity.ts` `ACCOUNT_TYPES` | CONSUMER, DRIVER, COURIER, HOST, MERCHANT, ADMIN | Canonical for DB + Identity TS |
| `database/.../018_unified_account_constraints.sql` | Same six in CHECK | Platform-wide constraint |
| `identity/.../admin-users.query.dto.ts` | Same six + `all` | Admin filter DTO **local copy** |
| `stays/.../account.types.ts` | Same six as union | **Duplicate**; order differs (HOST before DRIVER) |
| `identity/.../role-categories.ts` | PERSON includes HOST | Platform multi-role taxonomy |
| `identity/.../auth.dto.ts` | validate account_type including HOST | PIN/account select |
| Mobile / web | Prefer CONSUMER for Stays auth | `account_type: 'CONSUMER'` |

---

## 5. Inventory — Guards & Decorators

| Artifact | Identity | Stays |
|----------|----------|-------|
| Metadata key | `'account_types'` | `'accountTypes'` (**mismatch**) |
| Guard | `AccountTypeGuard` — used on Identity CONSUMER KYC/profile + **legacy** Go/Pay controllers | Implemented but **not registered** on any Stays module provider usage found |
| Decorator usage | Active on Identity users + legacy modules | **Import only** in `stays.controller.ts`; **zero** `@AccountTypes(...)` |
| Admin gate | Roles / account ADMIN | `@Roles('ADMIN')` + `RolesGuard` + Identity authz client |

---

## 6. Write / Issue Paths for `account_type`

| Where | Behavior relevant to Stays |
|-------|----------------------------|
| Identity `issueAccountScopedToken` | Puts `account_type` into access JWT |
| OTP verify / account select / PIN | Can issue DRIVER/COURIER/HOST/… JWTs when multi-account rows exist |
| Registration complete (Stays KYC path) | Consumer-oriented completion |
| Stays JWT strategy | Maps `payload.account_type` defaulting to `'CONSUMER'` |
| Host onboarding approve | Sets **host_profiles** APPROVED — does **not** flip Identity `account_type` to HOST |

---

## 7. Read / Enforce Paths (Stays)

| Check | Mechanism | Uses JWT HOST? |
|-------|-----------|----------------|
| Host “me” / can create listing | `host_profiles.application_status === 'APPROVED'` | No |
| Edit listing / calendar / host dash | `listing.host_user_id === userId` | No |
| Messaging host vs guest | conversation `host_user_id` / `guest_user_id` | No |
| Admin Stays | `@Roles('ADMIN')` + authz version | No (uses ADMIN) |
| Stays `@AccountTypes` | Unused | N/A |

BOLA-style specs (`bola-listings.spec.ts`) lock **ownership**, not account type.

---

## 8. Cleanup / Consistency Matrix

| Question | Result | Evidence |
|----------|--------|----------|
| Single shared enum package? | **FAIL** | Separate Identity const vs Stays union |
| Identity DB aligned with Identity TS? | **PASS** | CHECK matches six values |
| Stays types match Identity list? | **PASS today** (content) | Same six; fragile if one drifts |
| Metadata keys aligned? | **FAIL** | `account_types` vs `accountTypes` |
| Stays AccountTypeGuard in force? | **N/A (dead)** | No route wiring |
| Host gated by JWT HOST? | **No (by design)** | Ownership + profile |
| Docs match live Stays host path? | **FAIL** | Multi-account HOST JWT narrative |

---

## 9. Identity HOST vs Stays Host Lifecycle

| Step | Identity `account_type` | Stays host model |
|------|-------------------------|------------------|
| Guest register / KYC | CONSUMER | N/A |
| Become host submit | Still CONSUMER (typical) | host_profile PENDING |
| Admin approve host | Still CONSUMER (typical) | APPROVED |
| Create listing | CONSUMER JWT | `host_user_id` = that user |
| Select JWT HOST | Possible only if HOST **user row** exists | **Not** how current onboarding works |

Creating a future Identity `HOST` row without aligning Stays checks would create two parallel “host” concepts — high confusion risk.

---

## 10. Mobile / Web Client Behavior

- Mobile `auth_remote_datasource` / OTP account pick favors **CONSUMER**.
- Host onboarding APIs use authenticated user id + Stays host profile, not `account_type: HOST`.
- Web host dashboard uses Stays host APIs + viewer_role **HOST** as **booking UI role**, distinct from Identity enum.

---

## 11. Account Switching

Identity supports multi-account select (CONSUMER vs DRIVER etc.). For **current Stays product**, guests/hosts are one CONSUMER-shaped account plus Stays profile flags. Switching to a hypothetical HOST JWT is **not** the Stays hosting lifecycle. Residual: platform Identity can still mint HOST JWTs for accounts that exist in DB — Stays would treat them like any JWT userId unless ownership/profile checks fail.

---

## 12. Threat Scenarios

| Scenario | Exploitable today? | Notes |
|----------|-------------------|-------|
| A Attacker forges JWT `account_type=HOST` | **Not via this bug alone** | Need valid signature; Stays host still needs ownership / APPROVED profile |
| B Attacker assumes dead `@AccountTypes('HOST')` protects host route | **Dev footgun** | Guard not wired; if wrongly wired **instead of** ownership → possible misdesign |
| C Enum drift Identity vs Stays | Low today | Drift could cause 403 noise or weaken typed filters |
| D Rely on docs: “select HOST account to host” | UX/ops confusion | Product path is host_profiles |
| E Consumer token accesses another host’s listing | **Independent of SEC-012** | Ownership checks are the real control (separately tested) |
| F ADMIN via account_type | Covered by RolesGuard + SEC-003 authz | Not SEC-012 |

---

## 13. Server-Side Authority Distinctions

| Authority | Source of truth |
|-----------|-----------------|
| Identity role taxonomy | `users.account_type` + CHECK |
| Stays “is host” | `host_profiles.application_status` |
| Stays listing admin rights | `host_user_id` ownership |
| Stays platform admin | ADMIN role + live authz |

**Do not conflate** Identity `HOST` enum with Stays host privilege.

---

## 14. Existing Mitigations

- Listing ownership helpers (`requireOwnedListing`, BOLA specs).
- Host profile APPROVED gating in onboarding/`getHostMe`.
- Admin RolesGuard + Identity authz version (SEC-003).
- Stays JWT strategy defaults unknown type to CONSUMER (conservative for type missing, not a host grant).

---

## 15. False Positives / Intentionally Platform-Wide Types

| Item | Keep? | Why |
|------|-------|-----|
| Identity `DRIVER`/`COURIER`/`MERCHANT`/`HOST` in enum | Yes for platform DB | Multi-product Identity; Stays need not use all |
| Legacy Identity AccountTypeGuard on Go/Pay | Out of Stays scope | Not dead there |
| Stays ownership model | Yes | Correct product authorization |
| Unused Stays AccountTypeGuard code | **Should remove or wire intentionally** | Dead code ≠ required mid-host flow |

---

## 16. Test Coverage

| Area | Coverage |
|------|----------|
| Ownership / BOLA listings | Specs present |
| Host onboarding APPROVED | Specs use `account_type: 'CONSUMER'` fixture — reinforces product truth |
| Stays AccountTypeGuard | **No** usage tests found |
| Cross-package enum parity | **No** shared package / contract test |

Missing regression for remediation: assert Stays host endpoints do **not** require JWT HOST; assert APPROVED + ownership; optionally lock enum list parity.

---

## 17. Exact Gaps

1. **Duplicated** AccountType definitions (Identity / Stays / admin DTO copy).  
2. **Dead** Stays `AccountTypes` import + unused guard.  
3. **Metadata key mismatch** Identity vs Stays.  
4. **Semantic mismatch** Identity `HOST` vs Stays host_profiles.  
5. **Docs** describe HOST JWT selection as if it were Stays hosting.  
6. No shared single source of truth or contract test.

**Not a gap:** JWT Host must authorize hosting today — it must **not**.

---

## 18. Recommended Minimal Remediation (design only)

Prefer smallest change; **no** Identity schema rename; **no** Pay/Go rewrite.

1. **Document** in Stays + security status: *Stays host ≠ JWT account_type HOST; authority = host_profiles + ownership.*  
2. **Remove** unused `AccountTypes` import from `stays.controller.ts`.  
3. Either **delete** unused Stays `AccountTypeGuard` + decorator + type file **or** keep types only for typing JWT claims with a comment “not used for host authz.” Prefer delete dead guard if nothing imports it.  
4. **Optional (larger):** extract shared `@nexa/account-types` used by Identity + Stays + admin DTO — only if team wants drift prevention.  
5. **Do not** start requiring JWT HOST for Stays hosts without an explicit product migration (would break CONSUMER hosts).  
6. Align Stays docs (`auth-identity-account-refactor.md`) with “Stays uses CONSUMER + host_profiles” or mark HOST multi-account as future/platform-only.  
7. Backend changes for security exploit: **none required** today.

---

## 19. Required Regression Tests (when remediating)

1. Host listing mutation with CONSUMER JWT + APPROVED profile + ownership → **allowed**.  
2. Same with foreign `host_user_id` → **denied**.  
3. JWT claim `account_type=HOST` without ownership → **denied**.  
4. If enum package added: Identity `ACCOUNT_TYPES` equals Stays exported list (unit test).  
5. Lint/compilation: no unused AccountTypes import.

---

## 20. Files That Would Need Modification (remediation later)

- `backend/stays/src/modules/stays/stays.controller.ts` (drop unused import)  
- Optionally remove `stays/.../account-type.*` / types if unused  
- `backend/stays/docs/auth-identity-account-refactor.md` (clarify Stays host model)  
- Optional shared package + Identity/admin DTO imports  
- Tests as above  

---

## 21. Files That Must NOT Be Modified (this finding)

- Database CHECK / migrations unless product migrates HOST identity model  
- Payments / CMI / VPS / CI  
- SEC-011 mobile residue (separate)  
- Weakening ownership checks  
- Inventing Nexa Pay PIN lifecycle  

---

## 22. Risk Assessment

| Dimension | Rating |
|-----------|--------|
| Severity | Low |
| Current exploitability | Very low / none evidenced for Stays |
| Footgun for future code | Moderate |
| Dogfood / soft launch | OK |
| Public Stays launch | OK from pure security; hygiene recommended |

---

## 23. Final Verdict

**ACCEPTED RESIDUAL RISK**

SEC-012 is **not CLOSED**. It remains an open **correctness / documentation / dead-code** item with a documented security-adjacent footgun. It is **not** a present Stays privilege-escalation finding. Hygiene remediation is recommended on a P3 schedule after SEC-011 (and other higher items), not as a launch blocker for dogfood or mock-payment soft launch.

Do **not** treat Identity’s six-value enum alone as a Nexa Stays defect — platform multi-role is intentional; the defect is **duplication + unused Stays guard + HOST semantic confusion vs host_profiles**.

---

## Nexa Pay / PIN exclusion

Nexa Pay is not part of this audit. Identity Pin/account_type selection for DRIVER etc. is platform Identity behavior. Judged here only as it intersects Stays JWT claims and documentation.

---

## STOP

No code changes. No VPS. No deployment. Owner may accept residual risk or schedule hygiene cleanup separately from SEC-011 implementation.
