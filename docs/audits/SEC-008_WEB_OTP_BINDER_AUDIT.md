# SEC-008 — Web OTP / Identity Session Binder Audit

**Date:** 2026-08-11  
**Component:** `nexastays_web` + Identity OTP/`identity_session` binder  
**Mode:** AUDIT ONLY — no application code changes  
**Product:** Nexa Stays only (Nexa Pay / inventing Stays PIN lifecycle: out of scope)

| Field | Value |
|-------|--------|
| **Primary verdict** | **ACCEPTED RESIDUAL RISK** |
| **Severity** | **Low** standalone; **Medium** residual **if** same-origin XSS exists |
| **Repository status** | Residual OPEN as defense-in-depth (same class as Soft P3); not a remote standalone account-takeover bug |
| **Live / VPS / browser CSRF XSS lab** | **NOT VERIFIED** |

---

## 1. Executive Summary

SEC-008 concerns the **registration binder JWT** (`type: identity_session`, also accepted as `otp_session`) that Identity returns when OTP verify does not mint a durable access/refresh pair. The web client stores it in **`sessionStorage`** under `nexa_otp_session_token`, mirrors it in React `AuthContext` state as `tokenType === "otp_session"`, and sends it as **`Authorization: Bearer`** to Identity KYC/onboarding APIs and as **`otp_session_token` in the JSON body** for `POST /auth/registration/complete`.

**SMS OTP digits are not persisted** in web storage (React form state only). Access JWT remains **in-memory**; refresh remains **HttpOnly `nexa_refresh`** (PROD-SEC-001). SEC-009 phone-in-URL is **CLOSED** and is **not** reclassified as SEC-008.

**Confirmed gap:** The binder is **JavaScript-readable** (sessionStorage + React state). JWT payload includes **`phone_number`** (PII readable without secret key). Same-origin XSS can steal the binder within server TTL (~120m) and call KYC / `completeRegistration` while the DB session is unconsumed.

**Confirmed mitigations:** sessionStorage (not localStorage); ~120m TTL; DB `consumed` flag; JWT RS256 verify + iss/aud; logout / `setAuthJwt` clear the key; `completeRegistration` consumes before issuing durable tokens.

**Verdict:** **ACCEPTED RESIDUAL RISK** for Soft/dogfood and mock-payment soft launch — XSS-amplified defense-in-depth, not a network-only vulnerability. Optional P3 hardening (memory-only or HttpOnly short-lived cookie; hydrate must not prefer OTP over valid refresh) remains recommended before **broad** public exposure, but is not a Current Critical/High blocker under existing CSP + PROD-SEC-001.

**Do not reopen** SEC-009/010/011/012/013. **Do not** modify SEC-013.

---

## 2. Finding

| Field | Value |
|-------|--------|
| **ID** | SEC-008 |
| **Title** | Web OTP / identity-session binder in `sessionStorage` |
| **Severity** | Low (Medium under XSS) |
| **Attack** | Steal binder via XSS → KYC / completeRegistration / selectAccount / setPin within TTL |
| **Not an attack alone** | Remote CSRF/XSS-free theft — binder not ambient cookie-authenticated for Stays booking APIs |

---

## 3. Actual Authentication Lifecycle

```
OTP send → OTP verify
  ├─ Existing / select → access + refresh (cookie) → AuthContext JWT (memory)
  └─ New / onboarding.required → identity_session JWT
       → sessionStorage nexa_otp_session_token
       → registration (memory phone; SEC-009)
       → KYC/Sumsub using Bearer = binder
       → APPROVED + onboarding.required=false
       → POST /auth/registration/complete { otp_session_token }
       → server consume + access/refresh
       → setAuthJwt clears OTP key + memory phone
```

Stays product route does **not** require a Nexa Stays PIN step. Identity `setPin` exists in the API client as platform hygiene only — **not** used to redefine Stays onboarding in this audit.

---

## 4. Binder Creation

**Source:** Identity `AuthService` after successful OTP verify when a registration/session binder is issued (alongside/related to `otp_session_token` / `identity_session_token` response fields — same JWT value in current implementation).

**Persistence (server):**

- Table `otp_sessions`
- `session_token`: 32-byte hex opaque id
- `phone_number`, `expires_at` (**120 minutes**), `consumed: false`
- Optional `user_id` when consumer already known

**Client API fields:** `otp_session_token` and/or `identity_session_token` (login page prefers `otp_session_token ?? identity_session_token`).

---

## 5. Binder Claims

Signed JWT (`jwtService.sign`, RS256, issuer/audience from Identity config):

| Claim | Value |
|-------|--------|
| `sub` | Opaque DB `session_token` (hex) — **not** user UUID |
| `phone_number` | Normalized MSISDN (PII in client-readable JWT) |
| `type` | `'identity_session'` (server also accepts `'otp_session'`) |
| `unified_identity_id` | Unified identity id |
| `exp` | ~120m |

Server authority requires **JWT verify + DB row** (`sub` lookup, not expired, not consumed). Claims alone are not sufficient.

---

## 6. Client Storage Matrix

| State | Storage | Lifetime | Cleared where | Risk |
|-------|---------|----------|---------------|------|
| Registration binder | `sessionStorage` key `nexa_otp_session_token` | Tab/session; survives reload | Logout; `setAuthJwt`; `clearStoredTokens` | XSS-readable |
| Binder mirror | React `AuthContext` `token` + `tokenType: otp_session` | Until logout/complete/reload hydrate | Same | XSS / DevTools |
| Access JWT | In-memory (`access-token-store`) | Until refresh fail / logout / reload | Logout / clear | Not durable |
| Refresh | HttpOnly `nexa_refresh` | Cookie TTL | Logout clear cookie | CSRF class = SEC-013 (accepted) |
| Registration phone | In-memory module (`registration-phone-store`) | SPA heap | Logout / setAuthJwt | Lost on hard reload (fallback: JWT claim) |
| SMS OTP digits | React state only | Screen | Navigate away | Low |
| Binder in URL / localStorage / cookie / IndexedDB | **Not found** for binder | — | — | — |

**Confirmed:** Binder is **not** placed in registration URL (SEC-009 closed).

---

## 7. Browser Exposure

| Channel | Binder reaches? |
|---------|-----------------|
| `window.location` / query / fragment | **No** (repo static: SEC-009 tests) |
| `document.referrer` via URL phone | Mitigated by SEC-009 (binder itself not in URL) |
| sessionStorage | **Yes** |
| Analytics (`trackEvent`) | No binder payload found (messaging/guidance events only) |
| Console logging of binder | No dedicated `console.log(otp_session)` found in auth paths |
| DOM React render of full JWT | Not as intentional UI copy; exists in memory/state |
| Third-party Sumsub servers | **Sumsub SDK token** from Identity; binder used as **Bearer to Identity** to mint Sumsub token — binder JWT itself is not designed as Sumsub’s applicant credential |
| Stays product APIs | `api-client` / Stays clients attach Bearer **only when `tokenType === "jwt"`** — OTP binder not used as Stays ambient auth |

Live analytics/Sentry sinks: **NOT VERIFIED**.

---

## 8. Transport Matrix

| Endpoint | Binder location | Destination | Purpose | Replay protection |
|----------|-----------------|-------------|---------|-------------------|
| `POST /auth/otp/verify` | Response body | Client | Issue binder | OTP consume separate |
| `POST /kyc/submit` | `Authorization: Bearer` | Identity | Start/update KYC | JWT + resolver; session not consumed |
| `POST /kyc/sumsub/token` (and related) | Bearer | Identity | Mint Sumsub SDK access | Same |
| `POST /kyc/sumsub/sync-status` | Bearer | Identity | Poll KYC | Same |
| Profile/consent paths as used in onboarding | Bearer where configured | Identity | Onboarding | Resolver |
| `POST /auth/registration/complete` | Body `otp_session_token` | Identity | Mint access/refresh | Consume + TTL |
| `POST /auth/pin/set` | Body (platform API present) | Identity | setPin (not Stays UX) | Consume on success |
| `POST /auth/account/select` | Body identity session | Identity | Multi-account | Consume |
| Stays booking/host APIs | N/A (JWT only) | Stays | Product | Bearer access |
| Sumsub SDK host | Sumsub **access** token from Identity | Sumsub | KYC UI | Separate |

---

## 9. Server Validation

For `completeRegistration` / selectAccount / setPin patterns:

1. `jwtService.verify` (signature, exp, iss, aud)  
2. `type` ∈ `{identity_session, otp_session}`  
3. DB `otp_sessions` by `session_token = payload.sub`  
4. Reject if missing / `consumed` / `expires_at` past  
5. Phone from **DB session** for user resolution  
6. `completeRegistration`: require consumer user exists; set `consumed=true`; then issue access + refresh  

**KYC with Bearer binder:** `JwtStrategy` accepts identity_session; `OtpSessionResolverGuard` maps phone → CONSUMER user (create on KYC routes). Does **not** consume binder on KYC submit — intentional so Sumsub can complete before registration exchange.

**Logout does not revoke otp_sessions rows** (same as mobile SEC-011 server note) — TTL/consume remain controls.

---

## 10. Complete Registration Flow

1. Client holds unconsumed binder through KYC.  
2. On APPROVED + `onboarding.required === false`, web calls `completeRegistration(token)`.  
3. Server verifies, consumes session, issues tokens.  
4. `setAuthJwt` removes `nexa_otp_session_token` and clears registration phone.  

**Atomicity note:** `consumed` is persisted **before** token issuance. Failure after consume can leave binder dead without tokens (fail-closed for replay; UX recovery = new OTP). Concurrent double `completeRegistration` is a classic TOCTOU risk without row locking — second should fail once first commit lands; **no `SELECT FOR UPDATE` evidenced** in this pass (residual concurrency hygiene).

---

## 11. Replay / Consumption Analysis

| Case | Result |
|------|--------|
| Replay completeRegistration after success | Rejected (`consumed` / null) |
| Use binder after TTL | Rejected |
| KYC many times before complete | Allowed (by design) |
| setPin / selectAccount | Consumes binder |
| Stolen binder within TTL before consume | Attacker can hit KYC/complete if phone/user state allows |

---

## 12. Abandonment / Restart Analysis

| Scenario | Behavior | Intentional? |
|----------|----------|--------------|
| A Close tab after OTP | sessionStorage cleared with tab session | Yes |
| B Another tab same profile | sessionStorage is per-tab; separate tabs don’t share sessionStorage | Yes (isolated) |
| C Close mid-KYC | Binder gone with session; server TTL may still leave unused row | Server residue until TTL |
| D/E KYC cancel/fail | Binder remains until logout/expire/success | Yes (retry) |
| F Return after expiry | Client may still show otp token until used; server rejects | Cleanup hygiene gap |
| G Return before expiry (same tab reload) | Hydrate restores from sessionStorage | Yes resume |
| H New OTP | New binder issued; old client key overwritten on `setAuthOtpSession` | Partial (old DB row may linger until TTL) |
| I Logout mid-onboarding | OTP key + phone cleared; refresh revoke for JWT path | Yes |
| J Switch phone | New verify overwrites session key | Mostly |
| K Hard reload | Restores OTP from sessionStorage **preferred over refresh hydrate** | Resume UX; **gap** vs prior durable refresh |
| L Back/forward | SPA state + storage | Soft |
| M Multi-tab race complete | First consume wins; second fails | Soft |

**Important hydrate behavior (`AuthContext` mount):** If `sessionStorage` has OTP binder, client **sets otp_session and returns without attempting refresh-cookie hydrate**. Leftover binder can short-circuit restoring an authenticated JWT session in that tab until binder cleared/expired/consumed. Confirmed code behavior; browser quirks **NOT VERIFIED** beyond code.

---

## 13. Logout Analysis (web — not SEC-011)

| Artifact | Cleared on web logout? |
|----------|------------------------|
| Access (memory) | Yes |
| Refresh cookie | Yes (server `clearBrowserAuthCookies` via `/auth/logout`) |
| OTP binder sessionStorage | Yes |
| Registration phone memory | Yes |
| React auth state | Yes |
| BroadcastChannel `logout` | Clears other listeners’ stored tokens |

Mobile SEC-011 cleanup is separate and already CLOSED at repo level.

---

## 14. Refresh / Multi-Tab Analysis

- Soft nav: React state keeps binder.  
- Hard reload: sessionStorage restores binder; refresh hydrate skipped if binder present.  
- New tab: no sessionStorage inheritance → no binder unless re-OTP; refresh cookie may still hydrate JWT in new tab.  
- Duplicate tab race: server consume is the authority.

---

## 15. XSS Impact

| Question | Answer |
|----------|--------|
| Readable by JS? | **Yes** (sessionStorage + memory) |
| HttpOnly? | **No** |
| Steal → completeRegistration? | **Yes**, if unconsumed + consumer exists / KYC done as required |
| Steal → KYC submit / Sumsub token mint via Identity? | **Yes** |
| Steal → Stays bookings as host/guest without completing? | Stays APIs require account JWT; binder alone is Identity onboarding-scoped |
| Classification | **XSS-amplified residual**, not independent remote vuln |

---

## 16. Third-Party Leakage

| Third party | Binder sent? |
|-------------|--------------|
| Sumsub | Identity mints separate SDK token using binder as **Identity** auth; binder JWT not established as Sumsub’s stored credential |
| Maps / CDN | No evidence |
| Analytics events | No binder fields in `trackEvent` auth paths |
| Error monitoring | **NOT VERIFIED** live |

---

## 17. Existing Mitigations

- sessionStorage vs localStorage  
- 120m TTL + DB consume  
- RS256 + iss/aud  
- Logout / JWT auth clear OTP key  
- Stays Bearer only for `tokenType === "jwt"`  
- PROD-SEC-001 access in memory  
- SEC-009 no phone URL  
- Dashboard CSP (SEC-010) reduces XSS depth for admin surface (web guest CSP residual separate)  

---

## 18. Test Coverage

**Commands run (2026-08-11):**

```bash
cd nexastays_web
npx tsx --test lib/__tests__/auth-onboarding-flow.test.ts lib/__tests__/sec-009-registration-phone-url.test.ts
# → 15 passed

npx tsx --test  # via specific auth static suites earlier:
# prod-sec-001-auth-transport + logout-session-revoke → passed (5)
# bare `node --test` without tsx fails ESM resolution for .ts imports — use package `tsx --test`

cd backend/identity
npx jest src/common/security/cookie-csrf.spec.ts
# → passed (SEC-013 related; not SEC-008)
```

**Coverage gaps for SEC-008:** No automated test proves sessionStorage key cleared on logout; no test for “OTP hydrate must not block refresh”; no XSS/ binder replay e2e; no consume race test.

---

## 19. Exact Security Gaps

1. Binder **JS-readable** in `sessionStorage` (core SEC-008 residual).  
2. JWT embeds **`phone_number`** (client PII).  
3. Hydrate **prefers OTP over refresh** when both could apply.  
4. Failed/abandoned KYC leaves binder until expire/logout/tab end.  
5. Server `otp_sessions` not revoked on logout.  
6. `completeRegistration` consume-before-issue + lack of explicit locking (hygiene).  

**Not gaps:** SMS OTP digit persistence; binder in URL (SEC-009); ambient Stays access via binder.

---

## 20. Minimal Remediation Design (do not implement here)

Smallest practical improvements (any one reduces residual):

1. **Memory-only binder** (module/React ref) — accept hard-reload resume loss **or** pair with opaque server resume id.  
2. Or **HttpOnly short-lived cookie** for binder (CSRF Origin already production-gated — SEC-013 class).  
3. On hydrate: **if refresh succeeds, clear OTP key**; never prefer OTP over valid access session.  
4. Clear OTP key on KYC terminal reject after user returns to login; optional clear on consumed/401 from completeRegistration.  
5. Optional: strip `phone_number` from client JWT; resolve phone server-side from session id only (SEC-009 already uses claim as hard-reload fallback — would need another resume channel).  

Prefer (3)+(1) before inventing Pay PIN or changing Sumsub.

---

## 21. Required Regression Tests (future remediation)

1. `setAuthOtpSession` writes key; `logout` / `setAuthJwt` removes it.  
2. Mount with OTP in sessionStorage does not skip clear when refresh issued after complete in another path.  
3. After successful completeRegistration, key absent.  
4. completeRegistration twice → second fails.  
5. Stays API never attaches Bearer when `tokenType === "otp_session"`.  
6. No `phone=` / binder in URL (keep SEC-009).  

---

## 22. Files Reviewed

- `nexastays_web/contexts/AuthContext.tsx`  
- `nexastays_web/lib/auth-api.ts`, `auth-flow.ts`, `auth-session.ts`, `access-token-store.ts`  
- `nexastays_web/lib/registration-phone-store.ts`, `kyc-api.ts`, `api-client.ts`  
- `nexastays_web/app/[locale]/login/page.tsx`, `registration/page.tsx`  
- `nexastays_web/lib/__tests__/*` (auth/SEC-009/PROD-SEC-001)  
- `backend/identity/.../auth.service.ts` (issue/complete/select/setPin)  
- `backend/identity/.../jwt.strategy.ts`, `otp-session-resolver.guard.ts`  
- Prior: `P3_SECURITY_AUDIT_SEC_008_013.md`, `.cursor/docs/security/status.md`  

---

## 23. Files That Must NOT Be Modified (this audit)

- Payments / CMI / Nexa Pay  
- Mobile SEC-011 (already closed)  
- SEC-013 CSRF token work  
- SEC-012 host JWT HOST model  
- VPS / deploy / migrations  
- Unrelated booking features  

---

## 24. Risk Assessment

| Dimension | Rating |
|-----------|--------|
| Severity | Low / Medium-under-XSS |
| Remote exploit without XSS | No |
| Soft dogfood / mock payments | OK |
| Broad public | Prefer optional hardening |
| Real-money blocker | No (not money path) |

---

## 25. Final Verdict

**ACCEPTED RESIDUAL RISK**

SEC-008 is a **confirmed defense-in-depth residual** (JS-readable registration binder in `sessionStorage`), not a false positive and not fully CLOSED. Server TTL/consume + transport model keep standalone exploitability low. Treat optional remediation as Soft P3 hardening, not as an emergency privilege bug.

**Live / VPS:** **NOT VERIFIED**

---

## STOP

No code changes. No VPS. No deploy. No CMI. No Nexa Pay.
