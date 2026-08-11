# FINAL SECURITY CONSOLIDATION REPORT

**SEC-008 → SEC-013 + repository-wide regression audit**

**Date:** 2026-08-11  
**Mode:** AUDIT ONLY — no application code, tests, migrations, deploy, or VPS changes  
**Product:** Nexa Stays only (Nexa Pay / CMI / inventing PIN lifecycle: out of scope)

---

## 1. Executive verdict

**Repository security gate for the SEC-008–013 slice: PASS (with accepted Low residuals).**

| Closed remediations | SEC-008, SEC-009, SEC-010, SEC-011 — **REGRESSION PASS** |
| Accepted residuals | SEC-012, SEC-013 — **PASS-as-accepted** (not reopen) |
| New P0 / P1 / P2 in this pass | **None evidenced** |
| New P3 / INFO | Stale docs (`status.md` ambient-cookie matrix; some web BUGS docs) — **P3-SEC-NEW-001** remains documentation hygiene |

This pass did **not** reopen any closed finding. Contradictory wording in old docs does **not** override current code.

---

## 2. Repository security gate

| Question | Answer |
|----------|--------|
| P0 in SEC-008–013 scope? | **No** |
| P1 in this slice? | **No** |
| P2 requiring code now? | **No** (slice complete) |
| Dogfood (private / trusted)? | **Yes — acceptable at repository level** |
| Broad public launch? | **Conditional** — repo OK for Soft P3; **live/VPS verification required** before production approval |
| Next action | **VPS / live verification checklist** (not more SEC-008–013 remediations) |

---

## 3. SEC-008 regression result

**REGRESSION STATUS: PASS** — remains **CLOSED (repository)**  
**Live/VPS: NOT VERIFIED**

Evidence:

- Memory-only binder: `nexastays_web/lib/otp-session-store.ts`
- No `sessionStorage.setItem` for OTP in AuthContext; legacy key wiped via `clearLegacyOtpSessionStorage`
- Refresh-first hydrate: wipe legacy → `hydrateAuthSession()` → JWT wins / clears OTP; memory OTP only if no access token
- Stays/`api-client` Bearer only when `tokenType === "jwt"`
- Binder not in URL; `completeRegistration` still sends body `otp_session_token`
- Tests: `sec-008-otp-binder-storage.test.ts` + related suites — **passed**

Residual Soft: mid-registration XSS can still read **memory** binder (intentional tradeoff vs HttpOnly cookie).

---

## 4. SEC-009 regression result

**REGRESSION STATUS: PASS** — remains **CLOSED**  
**Live referrer/logs: NOT VERIFIED**

Evidence:

- No `searchParams.get("phone")` / `?phone=` registration navigation in `app/`
- `registration-phone-store` memory-only; login uses `setRegistrationPhone` + `buildRegistrationPath` without phone query
- Tests: `sec-009-registration-phone-url.test.ts` — **passed**

In-memory phone is **not** a reopen.

---

## 5. SEC-010 regression result

**REGRESSION STATUS: PASS** — remains **CLOSED**  
**Live headers: NOT VERIFIED**

Evidence:

- Dashboard `middleware.ts` nonce CSP + `lib/csp.js`
- Production: no `unsafe-eval`; no script `unsafe-inline`; invariants tested
- Tests: `nexastays_dashboard` `lib/csp.test.cjs` — **7 passed**

Accepted residuals: `style-src 'unsafe-inline'`; consumer-web CSP still may retain script unsafe-inline (separate from SEC-010 dashboard scope — not reinvented here).

---

## 6. SEC-011 regression result

**REGRESSION STATUS: PASS** — remains **CLOSED (repository)**  
**Live/VPS: NOT VERIFIED**

Evidence:

- Logout → `clearRegistrationSecrets()` (OTP binder + phone) + session `clearTokens` + `cached_user` remove; device id retained
- `clearTokens` remains narrow; `createPin` / completeRegistration delete client binder
- Tests: `flutter test test/features/auth/sec_011_session_residue_test.dart` — **8 passed**

createPin cleanup remains Identity hygiene — **not** Nexa Pay.

---

## 7. SEC-012 regression result

**REGRESSION STATUS: PASS-as-accepted** — remains **ACCEPTED RESIDUAL RISK** (Low / P3)

Evidence:

- Host authority = `host_profiles.application_status === 'APPROVED'` + `host_user_id` ownership
- Stays does **not** require JWT `account_type=HOST`
- Dead `@AccountTypes` import / unwired `AccountTypeGuard`; metadata key mismatch Identity vs Stays

No privilege-escalation path evidenced. Do **not** migrate to HOST JWT.

---

## 8. SEC-013 regression result

**REGRESSION STATUS: PASS-as-accepted** — remains **ACCEPTED RESIDUAL RISK** (Low)

Evidence:

- Logout/refresh **POST**; refresh HttpOnly + SameSite=Lax + Secure(prod); no ambient `nexa_access` issuance
- Bearer-only access extraction; production Origin gate in `cookie-csrf.ts`
- Tests: Identity cookie-csrf, browser-auth-cookies, logout.controller, bearer-access-token — **passed**; Stays cookie-csrf + BOLA + bearer — **passed**

Residuals: no double-submit CSRF token; no `Sec-Fetch-Site`; Origin gate only when `NODE_ENV=production`; live cookies **NOT VERIFIED**.

---

## 9. New findings

### P3-SEC-NEW-001 — Stale security matrix (INFO / P3 hygiene) — OPEN

| Field | Value |
|-------|--------|
| **Severity** | Low / documentation |
| **Component** | `.cursor/docs/security/status.md` (and some web BUGS/legacy reviews) |
| **Evidence** | Cookie/CSRF matrix still claims ambient access cookies exist as BLOCKING while PROD-SEC-001 CLOSED and code never issues ambient access |
| **Exploitability** | None — docs only |
| **Recommended action** | Update status matrix wording (docs-only; not this audit’s code pass) |
| **Launch impact** | None if operators use SEC-008–013 audits as authority |

### No new P0 / P1 / P2

Bounded BOLA / auth / secrets / CORS sweeps found **no concrete new privilege-escalation or secret-leak findings**.

**NOTE (INFO):** `bola-listings.spec.ts` uses NotFound for foreign owner in a helper mock while production `requireOwnedListing` uses Forbidden — documentation inconsistency only, not IDOR.

---

## 10. Authentication regression audit

| Control | Result |
|---------|--------|
| Access JWT web | Memory Bearer — PASS |
| Refresh web | HttpOnly `nexa_refresh` — PASS (repo) |
| Mobile tokens | SecureStorage + SessionManager — PASS |
| OTP binder web | Memory — PASS (SEC-008) |
| Ambient access cookie | Not issued — PASS |
| Token confusion OTP→Stays API | Blocked (`tokenType === "jwt"` only) — PASS |
| Refresh rotation / logout revoke | Specs + controller scope — PASS |
| JWT iss/aud / Bearer extract | Specs present — PASS |

---

## 11. Authorization / BOLA audit

| Area | Result |
|------|--------|
| Listing ownership | `requireOwnedListing` / host_user_id — PASS |
| Host listing gate | APPROVED profile + canList — PASS |
| Payments BOLA specs | Present — PASS (repo) |
| Logout cannot revoke other users | Session/device scoped — PASS |
| Concrete new IDOR this pass | **None** |

Full authenticated DAST on live stack: **NOT VERIFIED**.

---

## 12. KYC / onboarding audit

| Check | Result |
|-------|--------|
| Binder ≠ Stays booking auth | PASS |
| completeRegistration consume | PASS (server) |
| KYC Bearer = binder during onboard | Intentional; resolver maps phone — PASS |
| Client KYC status not sole admin of durable auth | Server onboarding + consume — PASS |
| Host approve server-controlled | host_profiles — PASS |

---

## 13. Web storage / token audit

| Item | Storage | Class |
|------|---------|-------|
| Access JWT | Memory | OK |
| Refresh | HttpOnly cookie | OK |
| OTP binder | Memory (+ legacy wipe) | OK |
| Registration phone | Memory | OK |
| Messaging/PWA/locale | local/session UI prefs | Non-auth — OK |

---

## 14. Cookie / CORS / CSRF audit

| Check | Result |
|-------|--------|
| SameSite=Lax / HttpOnly / Secure(prod) | PASS (repo contract) |
| CORS credentials + allowlist | PASS; prod requires `CORS_ORIGINS` |
| Wildcard origin + credentials | Not found |
| Cookie auth on Stays product APIs | Not ambient access — PASS |
| CSRF token | Absent — accepted SEC-013 |

---

## 15. Configuration audit

| Check | Result |
|-------|--------|
| Committed JWT PEM / sk_live / plaintext secrets | Not found in spot-check |
| NODE_ENV-gated CSRF Origin | Documented residual |
| Swagger in non-prod | Expected pattern |
| Env var names alone | Not treated as leaks |

---

## 16. Dependency / build audit

| Check | Result |
|-------|--------|
| Bounded review | CI audit jobs exist; Dependabot noise remains process gate |
| Convert all outdated pkgs to findings? | **No** — no new Critical dep finding evidenced this pass |

GitHub Dependabot on backend remote remains an **ops/process** gate, not a SEC-008–013 code reopen.

---

## 17. Test integrity

| Suite | Command | Result |
|-------|---------|--------|
| Web SEC-008/009/auth | `npx tsx --test` (sec-008, sec-009, prod-sec-001, logout, auth-onboarding) | **25 passed** |
| Mobile SEC-011 | `flutter test test/features/auth/sec_011_session_residue_test.dart` | **8 passed** |
| Dashboard SEC-010 | `node --test lib/csp.test.cjs` | **7 passed** |
| Identity CSRF/auth | `jest` cookie-csrf, browser-auth-cookies, logout.controller, bearer-access-token | **11 passed** |
| Stays CSRF/BOLA/bearer | `jest` cookie-csrf, bola-listings, bearer-access-token | **passed** (see terminal run) |

No tests modified. Live browser CSRF/XSS labs: **NOT RUN / NOT VERIFIED**.

---

## 18. Authoritative status table

| ID | Finding | Repository Status | Severity | Regression | Live/VPS | Launch Impact |
|----|---------|-------------------|----------|------------|----------|---------------|
| SEC-008 | Web OTP binder memory-only | **CLOSED** | Low (XSS Soft residual) | **PASS** | NOT VERIFIED | Soft OK |
| SEC-009 | Phone not in registration URL | **CLOSED** | Medium pre-fix | **PASS** | NOT VERIFIED | Soft OK |
| SEC-010 | Dashboard nonce CSP | **CLOSED** | Med–High pre-fix | **PASS** | NOT VERIFIED | Soft OK (admin headers pending live) |
| SEC-011 | Mobile OTP/phone logout wipe | **CLOSED** | Medium pre-fix | **PASS** | NOT VERIFIED | Soft OK |
| SEC-012 | AccountTypes / HOST JWT ≠ host | **ACCEPTED RESIDUAL RISK** | Low | **PASS-as-accepted** | N/A | No blocker |
| SEC-013 | Logout CSRF beyond Lax+Origin | **ACCEPTED RESIDUAL RISK** | Low | **PASS-as-accepted** | NOT VERIFIED | No blocker |
| P3-SEC-NEW-001 | Stale ambient-cookie docs | **OPEN** (docs) | Low | N/A | N/A | Docs only |

---

## 19. P0 / P1 / P2 / P3 summary

| Priority | Count (this consolidation) |
|----------|----------------------------|
| **P0** | **0** |
| **P1** | **0** |
| **P2** (code required in SEC-008–013) | **0** |
| **P3** | SEC-012 hygiene optional; SEC-013 optional CSRF token; P3-SEC-NEW-001 docs |
| Outside slice (unchanged gates) | PROD-OPS live backups; Twilio/JWT/CORS deploy evidence; DAST; monitoring; Dependabot process — still open as **ops/live** gates in `status.md`, not SEC-008–013 remediations |

---

## 20. Dogfood readiness

**YES — repository acceptable for Nexa Stays dogfood** (trusted/private, mock payments OK), contingent on correct env/secrets on the dogfood host when deployed. SEC-008–013 do not block dogfood bring-up.

---

## 21. Public-launch readiness

**NOT YET for full production approval.** Repository Soft P3 slice is complete, but public launch still requires:

- Live CSP / cookie / CORS / TLS verification on VPS  
- Deployed Twilio / JWT_ISSUER / AUDIENCE / CORS_ORIGINS evidence  
- Backup schedule + remote restore evidence (PROD-OPS-001)  
- Prefer fixing stale status.md wording so operators are not misled  

Mock-payment **soft public** can proceed only after operators accept live unverified headers as residual — this audit does **not** claim live OK.

---

## 22. VPS / live verification checklist

Do **not** claim verified until evidenced:

1. Dashboard `Content-Security-Policy` header (nonce, no script `unsafe-inline`/`unsafe-eval` in prod)  
2. Guest web security headers as deployed  
3. `Set-Cookie` for `nexa_refresh`: HttpOnly; Secure; SameSite=Lax  
4. Untrusted Origin → 403 on cookie-bearing POST logout/refresh  
5. `CORS_ORIGINS` exact allowlist + credentials behavior  
6. JWT iss/aud / Twilio SMS in production mode  
7. Backup timer + remote restore drill  
8. Optional: authenticated DAST smoke on listings/bookings/messages  

---

## 23. Exact next action

**Move to VPS / live verification** (read-only checks first; deploy only when access details and soft-launch criteria are approved).

Do **not** spend the next cycle on:

- SEC-013 CSRF tokens  
- SEC-012 shared enum package  
- Re-litigating SEC-008–011 code  

Optional docs-only: correct `status.md` ambient-cookie BLOCKING row (P3-SEC-NEW-001).

---

## FINAL ANSWERS (gate questions)

1. P0? **No**  
2. P1? **No**  
3. P2 in this slice needing code? **No**  
4. SEC-008–013 regression-free? **Yes** (closed = PASS; residuals = PASS-as-accepted)  
5. Accepted residual? **SEC-012, SEC-013** (+ Soft XSS memory residual on SEC-008)  
6. Code changes required now? **No** for SEC-008–013  
7. Docs/hygiene only? **P3-SEC-NEW-001**  
8. Dogfood OK (repo)? **Yes**  
9. Public launch OK? **Not until live/VPS gates**  
10. Still verify on VPS? **CSP, cookies, Origin CSRF, CORS, Twilio/JWT, backups**  
11. Next action? **VPS/live verification**

---

## STOP

No code changes. No VPS access. No deployment. No CMI. No Nexa Pay.
