# SEC-013 — Logout / Refresh Cookie CSRF Residual

**Date:** 2026-08-11  
**Component:** Identity `POST /auth/logout` + `POST /auth/refresh` + cookie Origin middleware (`cookie-csrf.ts`); web cookie transport  
**Mode:** AUDIT ONLY — no application code changes  
**Product:** Nexa Stays only (Nexa Pay excluded; PIN/Nexa Pay not required for this finding)

| Field | Value |
|-------|--------|
| **Primary verdict** | **ACCEPTED RESIDUAL RISK** |
| **Severity** | **Low** |
| **Repository status** | Residual OPEN as defense-in-depth (prior: PARTIALLY CLOSED mitigations) |
| **Live / VPS** | **NOT VERIFIED** |

---

## 1. Executive Summary

**SEC-013** is the residual CSRF / cookie-mutation concern on Identity **refresh** and **logout**, which still use the HttpOnly `nexa_refresh` cookie (PROD-SEC-001 / ADR-005).

**Confirmed:** This is a **real residual hardening item**, not an account-takeover CSRF under the current access model. Access authentication is **Bearer-only** (not ambient cookies). Cross-site CSRF cannot mint privileges via logout alone.

**Existing mitigations (repo):**

- Logout/refresh are **POST**
- Refresh cookie: **HttpOnly**, **Secure in production**, **SameSite=Lax**
- `enforceCookieRequestOrigin` rejects untrusted `Origin` on cookie-bearing unsafe methods when **`NODE_ENV=production`**
- CORS allowlist required in production
- Access JWT not issued in cookies for browser auth

**Residual gap (repo):**

- No double-submit / CSRF token
- Origin gate **inactive** unless `NODE_ENV === 'production'`
- No `Sec-Fetch-Site` check
- Live cookie flags / browser behavior **NOT VERIFIED**

**Final verdict: ACCEPTED RESIDUAL RISK** — Forced logout / session disruption in pathological cases remains theoretically possible as UX nuisance; confidentiality/integrity of accounts via CSRF alone is not established as a practical exploit given SameSite=Lax + Bearer access + production Origin gate.

---

## 2. Original Finding

From `P3_SECURITY_AUDIT_SEC_008_013.md`, `.cursor/docs/security/csrf.md`, and `status.md`:

| Field | Original |
|-------|----------|
| **ID** | SEC-013 |
| **Title** | Logout CSRF (beyond Lax + Origin) |
| **Severity** | Low |
| **Status** | PARTIALLY CLOSED mitigations; residual defense-in-depth OPEN |
| **Threat** | Cross-site forced logout if refresh cookie ever accompanies attacker-initiated POST |
| **Not claimed** | Account compromise via CSRF alone (access is Bearer) |

SEC-008 (OTP binder in `sessionStorage`) is **out of scope** for this audit and remains a separate open item.

---

## 3. Actual Repository Behavior

### Logout (`AuthController.logout`)

- `POST` + `@Public()`
- Prefer revoke: body `refresh_token` **or** cookie `nexa_refresh`
- Else optional `device_id` + resolved access principal → device-scoped revoke for **that** user only
- Always clears browser cookies via `clearBrowserAuthCookies` when `res` present
- Does **not** revoke all user sessions by default
- Idempotent when no refresh material present (`{ success: true }`)

### Refresh

- `POST /auth/refresh` accepts body refresh **or** cookie (browser transport)
- Rotates refresh; issues new access for Bearer use
- Cookie-bearing mutations are in the same Origin-gate class

### Cookie issuance (`browser-auth-cookies.ts`)

- Sets **only** `nexa_refresh` for browser cookie transport
- **Never** sets ambient `nexa_access` on new auth; clears legacy access cookie
- Flags: `httpOnly: true`, `sameSite: 'lax'`, `secure` iff production

### Origin middleware (`cookie-csrf.ts` — Identity and Stays)

Runs when **all** are true:

1. `NODE_ENV === 'production'`
2. Method is unsafe (not GET/HEAD/OPTIONS)
3. Cookie header contains `nexa_refresh=` or legacy `nexa_access=`

Then requires `Origin` ∈ CORS allowlist; else **403** `Untrusted browser request origin`.

Wired in Identity `main.ts` and Stays `main.ts` before CORS enablement.

### Web client

- `logoutBrowserSession` → `POST /auth/logout` with `withCredentials` + optional Bearer
- Access held in memory (`access-token-store`); refresh cookie for revoke/refresh only

### Mobile

- Uses bearer/secure storage; not the primary CSRF surface for HttpOnly refresh cookies. Logout path is session wipe (SEC-011). Not inventing Pay/PIN scope here.

---

## 4. Attack Surface

| Surface | Role in SEC-013 |
|---------|-----------------|
| `POST /auth/logout` | Cookie + optional body refresh revoke; clears cookies |
| `POST /auth/refresh` | Cookie/body refresh rotation |
| `nexa_refresh` cookie | Credential for refresh/logout CSRF class |
| Legacy `nexa_access` | Origin-gated if residual; not used for ambient Stays auth |
| `enforceCookieRequestOrigin` | Production cookie-mutation gate |
| Web `auth-api.ts` / AuthContext | Legitimate credentials include |
| Stays Origin middleware | Defense if residual cookies appear on Stays host |

---

## 5. Authentication

| Call | Auth requirement |
|------|------------------|
| Logout with refresh cookie/body | Possession of that refresh credential (no access JWT required) |
| Logout with `device_id` only | Access principal required for scoped revoke |
| Logout with neither | Still `200` + cookie clear attempt; no session revoke |
| Refresh | Valid refresh token (cookie or body) |
| Product APIs | Bearer access (PROD-SEC-001) — **not** cookie CSRF surface |

---

## 6. Authorization

Logout authorization is **session credential possession**, not role/RBAC:

- Refresh token identifies which row to revoke
- Device-scoped path binds to JWT `userId` from access principal — cannot pass another user's id as actor
- Cross-user mass logout via this endpoint is **not** supported without B’s refresh token

CSRF consideration: attacker needs the victim’s browser to send `nexa_refresh`. SameSite=Lax + Origin gate aim to stop that for cross-site POSTs in production.

---

## 7. Ownership / Object-Level Authorization

| Attack | Result |
|--------|--------|
| User A Bearer + `device_id` of B’s device | Revokes only A’s tokens matching that device_id (or none) — cannot target B’s `userId` |
| Present B’s refresh token | Revokes B’s session (possession = authority by design) |
| CSRF without cookie | No meaningful revoke |

---

## 8. Input Validation

- Nest `ValidationPipe` whitelist on DTOs
- Refresh/logout tokens are opaque strings; hashed server-side for lookup
- Origin checked as exact string match against allowlist (no substring spoof in allowlist design — live allowlist values **NOT VERIFIED**)

---

## 9. State / Workflow Security

| Concern | Behavior |
|---------|----------|
| Replay revoked refresh | Rejected on refresh (revoke/rotation tests exist) |
| Logout idempotency | Safe if already revoked / missing |
| Ordering | No multi-step workflow to skip for CSRF class |
| Access expiry | Logout still works via refresh cookie alone (by design) |
| Session fixation via CSRF refresh | Theoretically could rotate/disrupt; still requires cookie delivery under SameSite constraints |

---

## 10. Threat Scenarios

| Scenario | Exploitable? | Preconditions | Impact | Existing Mitigation |
|----------|--------------|---------------|--------|---------------------|
| A Unauthenticated CSRF logout | Generally **no** (Lax) / residual low | Victim on-site cookie; cross-site POST somehow sends Lax cookie | Forced logout UX | SameSite=Lax; prod Origin |
| B Authenticated consumer CSRF logout | Low residual | Same as A | Nuisance logout | Same |
| C Approved host | Same as consumer for Identity cookies | Same | Nuisance | Same |
| D Pending host | Same | Same | Nuisance | Same |
| E Cross-user resource via logout | **No** for other users’ sessions without their refresh | Stolen refresh = not CSRF | Session revoke of possessed token only | Session-scoped revoke |
| F Malicious client params | Device path cannot elevate to other userId | Bearer of A | Limited to A | Principal binding |
| G Replay refresh after logout | **No** once revoked | — | Auth fail | Revoke + rotation |
| H Expired access, valid refresh | Logout still works | Design | Session end | Intended |
| I Account switch | Web memory access cleared; cookie refresh per browser profile | — | — | PROD-SEC-001 |
| J Admin | Admin login separate; logout CSRF still UX-level if cookies used | — | Forced admin logout nuisance | Same cookie stack |
| K Direct API without UI | Valid with cookie/body; CSRF needs browser | Attacker API ≠ CSRF | — | — |
| Non-prod NODE_ENV with real cookies | Origin gate **off** | Mis-set env | Higher CSRF residual | Production fail-closed CORS + gate when env correct |

---

## 11. Existing Mitigations

1. POST-only logout/refresh  
2. SameSite=Lax refresh cookie  
3. Secure flag in production  
4. HttpOnly refresh  
5. Production Origin allowlist middleware  
6. CORS credentials + exact origins (production requires `CORS_ORIGINS`)  
7. Bearer-only access for APIs (PROD-SEC-001 CLOSED in repo)  
8. No ambient access cookie issuance  
9. Unit tests: `cookie-csrf.spec.ts`, `browser-auth-cookies.spec.ts`, logout revoke specs, web transport static tests  

---

## 12. Test Coverage

| Area | Coverage |
|------|----------|
| Origin reject/allow (unit, NODE_ENV=production) | Yes — Identity & Stays specs |
| Cookie flags contract | Yes |
| Logout session scope / no revoke-all | Yes |
| Refresh after revoke | Yes |
| Web credentials + cookie transport static | Yes |
| Browser CSRF end-to-end (cross-site form) | **Missing** |
| Origin gate when NODE_ENV≠production | Documented inactive — no “must fail open” exploit test required |
| Sec-Fetch-Site / CSRF token | **Missing** (not implemented) |
| Live VPS cookie flags | **NOT VERIFIED** |

---

## 13. Exact Security Gaps

1. **No CSRF synchronizer / double-submit token** on logout/refresh.  
2. **Origin gate disabled** whenever `NODE_ENV !== 'production'` (dogfood/staging misconfiguration risk).  
3. **No `Sec-Fetch-Site`** defense-in-depth.  
4. Logout remains `@Public()` and returns success even without credentials (clears cookies in response only) — not itself a privilege bug.  
5. Live production Origin allowlist + cookie Secure/SameSite behavior: **NOT VERIFIED**.

**Not a gap:** Ambient access CSRF for Stays APIs — access is Bearer.  
**Not a gap:** Cross-user logout without victim refresh possession.

---

## 14. Recommended Remediation (design only — do not implement)

Minimal, preference order:

1. **Ops/config:** Ensure any internet-facing Identity always runs with `NODE_ENV=production` and correct `CORS_ORIGINS` (already production fail-closed for missing CORS).  
2. **Optional code (P3):** Also enable Origin (or `Sec-Fetch-Site: same-origin|same-site`) for cookie mutations when `AUTH_COOKIE_CSRF=1` / dogfood profile — without waiting for full CSRF tokens.  
3. **Optional code (stronger):** Double-submit CSRF header for refresh/logout only.  
4. Keep POST; do not reintroduce ambient access cookies.

Backend CSRF token is **not required** to close account-compromise risk under current model; it is hardening against UX logout DoS.

---

## 15. Required Regression Tests (for future remediation)

1. Production: cookie POST logout without Origin → 403  
2. Production: evil Origin → 403; allowlisted Origin → next  
3. Non-prod with gate flag on → same behavior if remediation adds it  
4. SameSite flag contract remains Lax + HttpOnly + Secure(prod)  
5. CSRF cannot revoke session without cookie delivery (document browser expectation; optional Playwright later)  
6. No ambient `nexa_access` set on login  

---

## 16. Files That Would Need Modification (if remediated later)

- `backend/identity/src/common/security/cookie-csrf.ts`  
- Possibly `backend/stays/src/common/security/cookie-csrf.ts` (parity)  
- Related specs  
- Optional web CSRF header on refresh/logout clients  
- Docs: `csrf.md`, `status.md`

---

## 17. Files That Must NOT Be Modified (this finding)

- Payments / CMI  
- Nexa Pay / inventing PIN as CSRF fix  
- SEC-008/009/010/011/012 remediations  
- VPS live config in this audit  
- DB migrations  
- Reintroduction of ambient access cookies  

---

## 18. Risk Assessment

| Dimension | Rating |
|-----------|--------|
| Severity | **Low** |
| Account takeover via CSRF | Not established / effectively mitigated |
| Forced logout / refresh disruption | Residual Low |
| Exploitability (modern browsers + Lax + prod Origin) | Low |
| Dogfood | Soft OK if `NODE_ENV=production` on exposed Identity |
| Launch blocker | No |

---

## 19. Final Verdict

**ACCEPTED RESIDUAL RISK**

SEC-013 is **not CLOSED**: double-submit CSRF and non-production Origin gating remain intentional residual defense-in-depth. Mitigations already present make the original “logout CSRF” concern **not a meaningful privilege-escalation or account-compromise path** under the current Bearer access model.

Do not mark CLOSED without either:

- implementing additional CSRF token / always-on Origin/`Sec-Fetch-Site` hardening, **and** regression tests, **or**  
- an explicit owner acceptance recorded (this audit serves as that acceptance for **residual Low** risk).

**Live / VPS:** **NOT VERIFIED**

---

## Relation to prior completed items

| ID | Status | Note |
|----|--------|------|
| SEC-009 | CLOSED (repo) | No reopen |
| SEC-010 | CLOSED (repo) | No reopen |
| SEC-011 | CLOSED (repo) | No reopen |
| SEC-012 | ACCEPTED RESIDUAL RISK | Separate |
| SEC-008 | Still OPEN | Separate; not remediated here |
| PROD-SEC-001 | CLOSED (repo) | Prerequisite that reduces SEC-013 impact |

---

## STOP

No code changes. No VPS. No deployment. No production verification claims.
