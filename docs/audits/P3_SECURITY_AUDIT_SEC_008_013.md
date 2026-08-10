# NEXA STAYS — P3 SECURITY AUDIT REPORT

**Date:** 2026-08-10  
**Mode:** AUDIT ONLY — no application code, migrations, deploy scripts, CI, or VPS changes in this pass (report document only).  
**Scope:** SEC-008–013 + remaining P3 security/hardening + auth/session deep review after PROD-SEC-001.

Live VPS / DNS / TLS / production headers: **NOT VERIFIED** (no VPS connection).

---

## 1. Executive Summary

SEC-001–006, PROD-SEC-001, and PROD-INV-001 remain closed in the current repositories with **no concrete reopen regressions** found in audited auth/session paths.

SEC-008–013 are **all still real and OPEN** (or PARTIALLY CLOSED for SEC-013 mitigations). Highest launch-relevant items in this set:

1. **SEC-010** — Dashboard has **no Content-Security-Policy** (admin XSS depth gap).
2. **SEC-009** — Full phone numbers still placed in `/registration?phone=` (PII hygiene).
3. **SEC-011** — Mobile OTP session + phone keys survive logout (device residue).

SEC-008 is **defense-in-depth** (registration `identity_session` JWT in `sessionStorage`, not SMS OTP digits). SEC-012 is largely **correctness** debt. SEC-013 residual is **forced-logout nuisance**, not account compromise under SameSite=Lax + production Origin gate + Bearer-only access.

**Other open/partial non-P3 (not re-scoped):** PROD-OPS-001/002/003, PROD-SEC-002, SEC-007 (CMI FUTURE), infrastructure/outbox/DAST gates in `status.md`.

**Final security verdict for this P3 slice:** **REMEDIATION REQUIRED** (before wide public + admin production; not an immediate dogfood architecture blocker).

---

## 2. Findings

### SEC-008 — Web OTP session storage

| Field | Value |
|-------|--------|
| **ID** | SEC-008 |
| **Severity** | Low (Medium residual **if** same-origin XSS exists) |
| **Component** | `nexastays_web` + Identity OTP session |
| **Status** | **OPEN** |
| **Evidence** | `AuthContext.tsx` key `nexa_otp_session_token` in `sessionStorage`; set after OTP verify when registration binder issued; Identity `auth.service.ts` issues `type: identity_session` JWT (~120m) with `sub` = opaque DB session token and claim `phone_number`. SMS OTP digits are React-state only (not stored). Access JWT remains in-memory (`access-token-store.ts`); refresh HttpOnly `nexa_refresh`. |
| **Attack / failure** | XSS steals registration binder → KYC/profile/completeRegistration / selectAccount / setPin → may mint durable session within TTL. Without XSS: not remote-exploitable. |
| **Impact** | Mid-registration hijack under XSS; PII (`phone_number`) readable from JWT payload. |
| **Exploitability** | Low standalone; depends on XSS. Classification: **defense-in-depth / acceptable residual** for Soft P3. |
| **Existing mitigation** | sessionStorage (not localStorage); server consume + TTL; logout/`setAuthJwt` clears key; Bearer-only access; PROD-SEC-001 transport tests forbid auth `localStorage`. Gap: leftover OTP can short-circuit refresh hydrate; KYC failures may leave token until expire/tab close. |
| **Recommended remediation** | Prefer HttpOnly short-lived cookie or memory-only binder; strip phone from client JWT; clear OTP key on BroadcastChannel `session`, abort, and 401/consumed; do not prefer OTP over valid refresh on hydrate. |
| **Launch impact** | Dogfood: OK. Public production: fix as P3 before broad launch preferred. Real-money: not money-path blocker. |

---

### SEC-009 — Phone in registration URL

| Field | Value |
|-------|--------|
| **ID** | SEC-009 |
| **Severity** | Medium (PII exposure / hygiene) |
| **Component** | `nexastays_web` login → registration |
| **Status** | **OPEN** |
| **Evidence** | `app/[locale]/login/page.tsx` builds `...?phone=${encodeURIComponent(phone)}` for registration (OTP-session and 404 branches). Registration reads `searchParams.get("phone")`. Identity APIs use JSON body `phone_number`, not query. Web `Referrer-Policy: no-referrer` reduces third-party Referer leak. |
| **Attack / failure** | Phone appears in browser history, proxy/access logs, screenshots, copied links; analytics if URL capture enabled. |
| **Impact** | PII disclosure; weak client-side tension with SEC-004 (404→register+phone) though server login remains existence-neutral. |
| **Exploitability** | High for shoulder-surf / shared device / log retention; not remote account takeover by query alone. |
| **Existing mitigation** | Referrer-Policy; unauth redirect from registration drops phone query. |
| **Recommended remediation** | Carry phone via memory/`sessionStorage` after verify; never put full MSISDN in URL. Remove/gate 404 client branch that re-injects phone. |
| **Launch impact** | Dogfood: soft OK. Public production: **should fix**. Real-money: privacy gate, not ledger gate. |

---

### SEC-010 — Dashboard CSP

| Field | Value |
|-------|--------|
| **ID** | SEC-010 |
| **Severity** | Medium–High (admin XSS depth) |
| **Component** | `nexastays_dashboard` |
| **Status** | **OPEN** |
| **Evidence** | `nexastays_dashboard/next.config.js` sets nosniff, XFO DENY, Referrer-Policy, Permissions-Policy, HSTS (prod) — **no `Content-Security-Policy`**. No dashboard `middleware.ts`. Deps primarily first-party (`next`, `react`, `lucide-react`). Contrast: `nexastays_web` has CSP with `'unsafe-inline'` scripts/styles, prod drops `'unsafe-eval'`, Sumsub + map CDN host allowances. |
| **Attack / failure** | Stored/reflected XSS on admin origin has no CSP backstop for script execution. |
| **Impact** | Elevated for admin tooling (role/config abuse contingent on XSS sink). |
| **Exploitability** | Requires XSS; CSP absence increases blast radius. |
| **Existing mitigation** | Frame deny, nosniff, HSTS; admin JWT + SEC-003 `av`. |
| **Recommended remediation** | Add dashboard CSP: `default-src 'self'`; tight `connect-src` to Identity/Stays; `object-src 'none'`; `frame-ancestors 'none'`. Allow only proven Next needs (often limited `style-src 'unsafe-inline'`). Verify live response headers (**NOT VERIFIED** here). |
| **Launch impact** | Dogfood admin: fix soon. Admin public production: **treat as required hardening**. |

---

### SEC-011 — Mobile OTP session residue

| Field | Value |
|-------|--------|
| **ID** | SEC-011 |
| **Severity** | Medium |
| **Component** | `nexastays-mobile` (Flutter) |
| **Status** | **OPEN** (**AUDITABLE** — mobile repo present) |
| **Evidence** | `auth_repository_impl.dart`: `_otpSessionKey = nexastays_otp_session_token`, phone key written to `FlutterSecureStorage`. Deleted on Sumsub-approved completeRegistration path. **Logout** deletes access token / user cache but **does not** delete OTP session or phone keys. `clearTokens()` similarly omits OTP/phone. |
| **Attack / failure** | Abandoned KYC / logout leaves usable registration binder on device within server TTL; shared/stolen phone resume. |
| **Impact** | Session hygiene / mid-registration takeover on device. |
| **Exploitability** | Local/device access; not network-only. |
| **Existing mitigation** | SecureStore; server TTL/consume (server path must remain authoritative). |
| **Recommended remediation** | Explicitly delete OTP + phone keys on logout, PIN-complete (if unused), abandon, and failure/expiry paths. |
| **Launch impact** | Dogfood trusted devices: soft OK. Production mobile: **should fix** for shared-device threat model. |

---

### SEC-012 — AccountTypes inconsistency

| Field | Value |
|-------|--------|
| **ID** | SEC-012 |
| **Severity** | Low |
| **Component** | Identity / Stays / JWT / mobile |
| **Status** | **OPEN** (correctness; limited security adjacency) |
| **Evidence** | Identity `ACCOUNT_TYPES`: CONSUMER\|DRIVER\|COURIER\|HOST\|MERCHANT\|ADMIN. Stays `account.types.ts` mirrors same six. Decorator metadata keys differ (`account_types` vs unused Stays pattern). Stays host authorization is ownership/`host_user_id` APPROVED, **not** JWT `HOST`. Stays `@AccountTypes` essentially unused; admin uses `@Roles('ADMIN')` + `av`. Mobile prefers CONSUMER. |
| **Attack / failure** | Future misuse if someone gates Stays hosts solely on JWT `HOST` without ownership checks. |
| **Impact** | Confusion / tech debt; not current privilege escalation path evidenced. |
| **Exploitability** | Low today. Class: **correctness-only** with **security-adjacent** footgun. |
| **Existing mitigation** | Ownership-based host routes; SEC-003 admin live check. |
| **Recommended remediation** | Shared package enum; remove dead Stays decorator import or enforce intentionally; document hosts ≠ JWT HOST. |
| **Launch impact** | Not a dogfood/production money blocker. |

---

### SEC-013 — Logout CSRF

| Field | Value |
|-------|--------|
| **ID** | SEC-013 |
| **Severity** | Low |
| **Component** | Identity logout/refresh + cookie Origin middleware |
| **Status** | **PARTIALLY CLOSED** (mitigations exist) / residual **OPEN** as defense-in-depth |
| **Evidence** | Logout is **POST** (`auth.controller.ts`); clears cookies via `clearBrowserAuthCookies`; refresh HttpOnly + Secure(prod) + SameSite=Lax. `cookie-csrf.ts` Origin allowlist on cookie-bearing unsafe methods when `NODE_ENV=production`. Access not ambient (PROD-SEC-001). No double-submit CSRF token. Origin gate inactive if Node env ≠ production. |
| **Attack / failure** | Cross-site forced logout (nuisance/DoS UX) if cookie ever sent; **not** account compromise via CSRF alone. |
| **Impact** | Forced logout. |
| **Exploitability** | Low under modern browsers + Lax + prod Origin gate. |
| **Existing mitigation** | POST-only; SameSite=Lax; prod Origin gate; Bearer access. |
| **Recommended remediation** | Optional CSRF header/token; enforce Origin (or Sec-Fetch-Site) for dogfood/staging with `NODE_ENV=production`; keep POST. |
| **Launch impact** | Does not block dogfood or real-money by itself. |

---

### Auth / session deep review (PROD-SEC-001 consistency)

| Check | Result |
|-------|--------|
| Access JWT in localStorage/sessionStorage | **Not found** for auth (OTP binder only in sessionStorage) |
| Ambient `nexa_access` for API auth | **Not reintroduced** in audited web/Stays Bearer extraction |
| Refresh HttpOnly | Present |
| OTP SMS digit persistence in web storage | **Not present** |
| Logging OTP values | Production fail-closed Twilio path; `safeLogger` / telemetry redact patterns include otp/token/authorization (`platform/telemetry/src/redact.ts`). Live log sinks **NOT VERIFIED**. |

**Regressions vs SEC-001–006 / PROD-SEC-001 / PROD-INV-001:** **None** with concrete code evidence. Doc smell: `status.md` cookie matrix still says ambient cookies “currently exist” / BLOCKING — **stale documentation**, not a runtime reopen (logged as P3-SEC-NEW-001).

---

### Other P3 / related items

#### P3-SEC-NEW-001 — Stale security matrix row (ambient cookies)

| Field | Value |
|-------|--------|
| **Severity** | Low (process/docs) |
| **Status** | **OPEN** |
| **Evidence** | `.cursor/docs/security/status.md` Authentication CSRF row still claims ambient access cookies exist as BLOCKING while PROD-SEC-001 CLOSED and code clears/never issues ambient access. |
| **Impact** | Misleading launch gates. |
| **Launch impact** | Docs cleanup; not runtime. |

#### P3-SEC-NEW-002 — Consumer web CSP retains `unsafe-inline`

| Field | Value |
|-------|--------|
| **Severity** | Medium (known, accepted with Sumsub constraints) |
| **Component** | `nexastays_web/next.config.js` |
| **Status** | **ACCEPTED RESIDUAL RISK** / **PARTIALLY CLOSED** vs ideal CSP |
| **Evidence** | `script-src`/`style-src` include `'unsafe-inline'`; prod drops `'unsafe-eval'`; Sumsub + map image wildcards. Live edge headers **NOT VERIFIED**. |
| **Launch impact** | Continue hardening when Sumsub/Next allow; not a new Critical. |

#### P3-SEC-NEW-003 — Unbounded conversation listing

| Field | Value |
|-------|--------|
| **Severity** | Medium (DoS/perf) |
| **Status** | **OPEN** (carried from prior `status.md`) |
| **Evidence** | Listed open in security status; repository confirms known operational risk at scale. |
| **Launch impact** | Soft OK dogfood; harden before large-scale production. |

#### CHECKED_IN lifecycle

| Field | Value |
|-------|--------|
| **Status** | **ACCEPTED RESIDUAL RISK** / correctness-ops (not a new SEC ID) |
| **Evidence** | `CHECKED_IN` intentionally occupies inventory with INITIATED/PAYMENT_PENDING/CONFIRMED (PROD-INV-001 aligned; COMPLETED excluded). Security of overlap constraint **CLOSED**. Remaining work is operational transition automation, not a CSRF/auth issue. |

#### Optional / no-op OTel

| Field | Value |
|-------|--------|
| **Status** | **ACCEPTED RESIDUAL RISK** |
| **Evidence** | `@nexa/telemetry` supports optional OTel; absence of exporter is observability gap, covered primarily under PROD-OPS-003 (**IMPLEMENTED — NOT VERIFIED**), not a discrete Critical auth finding. |

#### Web npm audit handling

| Field | Value |
|-------|--------|
| **Status** | **NOT VERIFIED** (CI jobs exist; Dependabot still reports high issues on backend remote — process gate) |
| **Evidence** | Workflows/docs require `npm audit`; GitHub Dependabot noise observed on push. Treat as ongoing dependency hygiene, not SEC-008–013. |

#### Logging / secrets (spot check)

| Field | Value |
|-------|--------|
| **Status** | **PARTIALLY CLOSED** / **NOT VERIFIED** in production sinks |
| **Evidence** | Telemetry redaction for token/authorization/otp/password/cookie/dsn keys. SEC-002 production Twilio fail-closed. No new OTP plaintext logging path found in this pass. |

---

## 3. SEC-008–013 Table

| ID | Finding | Severity | Status | Launch impact |
|----|---------|----------|--------|---------------|
| SEC-008 | Registration binder JWT in `sessionStorage` | Low (Med under XSS) | OPEN | Dogfood OK; public P3 |
| SEC-009 | Full phone in registration query URL | Medium | **CLOSED** (repo; live NOT VERIFIED) | Code fix landed |
| SEC-010 | Dashboard missing CSP entirely | Medium–High | **CLOSED** (repo; live headers NOT VERIFIED) | Admin prod hardening addressed in code |
| SEC-011 | Mobile OTP/phone residue after logout | Medium | OPEN | Fix for shared-device prod |
| SEC-012 | AccountTypes duplication / dead Stays guard | Low | OPEN | Correctness cleanup |
| SEC-013 | Logout CSRF beyond Lax+Origin | Low | PARTIALLY CLOSED | Residual P3 |

---

## 4. New Findings

| ID | Finding | Severity | Status |
|----|---------|----------|--------|
| P3-SEC-NEW-001 | `status.md` stale ambient-cookie BLOCKING wording vs PROD-SEC-001 CLOSED | Low | OPEN |
| P3-SEC-NEW-002 | Consumer web CSP `unsafe-inline` (known residual) | Medium | ACCEPTED RESIDUAL RISK |
| P3-SEC-NEW-003 | Unbounded conversation listing (prior open) | Medium | OPEN |

---

## 5. Regressions

**None** against SEC-001–006, PROD-SEC-001, or PROD-INV-001 with concrete runtime evidence.

Soft notes (not reopen):

- SEC-004 client UX branch still navigates 404 → registration with phone (server neutrality intact).
- Documentation matrix lag (P3-SEC-NEW-001).

---

## 6. Evidence

### Files / areas inspected

- `nexastays_web/contexts/AuthContext.tsx`, `app/[locale]/login/page.tsx`, `app/[locale]/registration/page.tsx`, `lib/access-token-store.ts`, `lib/__tests__/prod-sec-001-auth-transport.test.ts`, `next.config.js`
- `nexastays_dashboard/next.config.js`
- `nexastays-mobile/lib/features/auth/data/repositories/auth_repository_impl.dart`, secure/local storage helpers
- `backend/identity/.../auth.service.ts`, `auth.controller.ts`, `browser-auth-cookies.ts`, `cookie-csrf.ts`, `user.entity.ts` AccountType
- `backend/stays/src/common/types/account.types.ts`, host/admin guards (ownership vs AccountTypes)
- `platform/telemetry/src/redact.ts`
- `.cursor/docs/security/status.md`, `csrf.md`, related checklist refs

### Tests inspected (existence — not treated as production VERIFIED)

- Web PROD-SEC-001 / logout transport static tests
- Identity browser-auth-cookies / logout specs
- SEC-003 RolesGuard / SEC-005–006 suites (not re-executed as gate for this report)

### Migrations

- No new migration review required for SEC-008–013; PROD-INV-001 inventory set referenced for CHECKED_IN context only.

---

## 7. Recommended Fix Order

| Priority | Items |
|----------|--------|
| **P0** | None newly found in SEC-008–013 set |
| **P1** | (Outside this slice, still open) PROD-OPS/SEC production gates: Twilio/JWT/CORS deploy evidence, backups remote, media production bucket, monitoring event proof |
| **P2** | **SEC-010** dashboard CSP; **SEC-009** remove phone from URLs; **SEC-011** mobile logout cleanup |
| **P3** | SEC-008 storage hardening; SEC-013 CSRF token/Origin on all prod-like Node boots; SEC-012 unify AccountTypes; P3-SEC-NEW-001 docs; conversation listing bounds |
| **Residual** | Web CSP `unsafe-inline` with Sumsub; optional OTel exporter; CHECKED_IN ops automation |

---

## 8. Production Readiness Impact

| Finding | Blocks dogfood? | Blocks public production? | Blocks real-money production? |
|---------|-----------------|---------------------------|-------------------------------|
| SEC-008 | No | Prefer fix | No |
| SEC-009 | No | **Should fix** | Privacy — should fix |
| SEC-010 | Soft (admin) | **Yes for admin prod confidence** | Indirect (admin abuse depth) |
| SEC-011 | Soft | **Should fix** for mobile | Soft |
| SEC-012 | No | No | No |
| SEC-013 | No | No | No |
| PROD-OPS-001/002/003 / PROD-SEC-002 / Twilio deploy | External gates | Yes for full prod approval | Yes (payments later / CMI FUTURE) |

---

## 9. Final Security Verdict

**REMEDIATION REQUIRED**

Reason: SEC-008–013 remain open/partial with actionable Medium items (dashboard CSP, phone-in-URL, mobile residue) before treating public/admin production security as complete. Closed Critical/P2 controls (SEC-001–006, PROD-SEC-001, PROD-INV-001) were **not** reopened.

This is **not** a claim of overall production readiness, dogfood deployment readiness, or real-money readiness.

---

## STOP

No code fixes performed. No VPS connection. No CMI work. Owner should choose the next remediation task from the priority table above.
