# SEC-011 — Mobile OTP / Session Residue

**Date (audit):** 2026-08-11  
**Date (remediation):** 2026-08-11  
**Product:** Nexa Stays mobile only. Nexa Pay is out of scope.

| Field | Value |
|-------|--------|
| **Repository status** | **CLOSED** |
| **Live / VPS** | **NOT VERIFIED** |
| **Severity** | Medium (pre-fix); residual risk after fix is low (device-local abandon without logout still resumes intentionally) |

---

## Remediation summary (implemented)

### Cleanup behavior

| Event | OTP binder | Phone | Access/refresh/userId | cached_user | device id |
|-------|------------|-------|----------------------|-------------|-----------|
| Active KYC / mid-registration | **kept** | **kept** | n/a | kept | kept |
| Logout / full auth wipe | **deleted** | **deleted** | **deleted** | **deleted** | **kept** |
| Successful `completeRegistration` | **deleted** | kept (profile fallback) | **saved** | rewritten | kept |
| Successful `createPin` | **deleted** (client hygiene; server already consumes) | kept | n/a | n/a | kept |
| New `sendOtp` | **cleared** before send | **cleared** before send | unchanged | unchanged | kept |
| `clearTokens()` only | **not** cleared | **not** cleared | **deleted** | n/a | kept |

Helper: `SecureStorageService.clearRegistrationSecrets()` — separate from `clearTokens()`.

Optional logout hygiene: deletes `has_pin_<userId>` for the logged-out user only.

### Files changed (mobile)

- `lib/core/storage/secure_storage.dart` — `SecureStorageKeys`, `clearRegistrationSecrets()`, `forTesting`
- `lib/features/auth/data/repositories/auth_repository_impl.dart` — logout wipe, createPin binder delete, sendOtp wipe, returning-user binder drop, registration finalize helper
- `lib/core/storage/local_storage.dart` — test reset hook
- `lib/core/utils/phone_normalizer.dart` — non-const RegExp (SDK compatibility)
- `test/features/auth/sec_011_session_residue_test.dart` — TESTS 1–7

### Tests

```
flutter test test/features/auth/sec_011_session_residue_test.dart
→ All tests passed (8 SEC-011 cases)
```

### Intentionally retained

- Binder + phone during active registration / KYC until logout or success
- App restart resume of mid-registration **without** logout (product UX)
- Phone after successful registration (hydration / profile fallback)
- `nexastays_device_id` across logout

### Remaining residual risk

- Shared-device abandon **without** logout can still resume within server ~120m TTL (intentional). Logout closes SEC-011 residue. Live device store behavior **NOT VERIFIED**.

---

# Original audit (below)

**Mode (original):** AUDIT ONLY — historical record; remediation landed after this audit.  
**Scope:** `nexastays-mobile` + Identity binder server controls relevant to mobile.  
**Product:** **Nexa Stays only.** Nexa Pay is **not** part of this audit.

**Audit-time verdict was: REMEDIATION REQUIRED** (now remediated at repo level).

---

## 1. Executive Summary

SEC-011 remains a real Medium finding for Nexa Stays mobile.

On the **new-user registration path**, FlutterSecureStorage retains:

- `nexastays_otp_session_token` — Identity `identity_session` / OTP binder JWT
- `nexastays_phone_number` — normalized MSISDN

`logout()` and `SecureStorageService.clearTokens()` clear **access / refresh / userId** (and the SharedPreferences `cached_user`), but **do not** delete the OTP binder or phone keys.

**Highest practical risk:** abandoned mid-registration (or app kill during KYC). On restart, `AuthCheckCachedUser` restores a pending `cached_user` and emits `AuthOtpVerified`, allowing registration/KYC continuation **without re-OTP** while the server binder remains valid (**~120 minutes**, unconsumed). That is local-device exploitability within TTL.

After a **clean full authenticated logout**, residual OTP/phone keys alone do **not** auto-rehydrate an authenticated session (cached user is removed). Server TTL/consume limits binder usefulness for network auth minting, but phone PII and a potentially still-valid binder JWT remain on device until overwritten or TTL expires.

PIN UI/code **exists in this repository** as Identity phone+PIN auth (not Nexa Pay). Owner instruction: do **not** invent Nexa Pay PIN cleanup. PIN is documented below only as it intersects binder consume/delete behavior.

---

## 2. SEC-011 Finding

| Field | Value |
|-------|--------|
| **ID** | SEC-011 |
| **Severity** | Medium |
| **Component** | `nexastays-mobile` auth storage / logout |
| **Status** | **OPEN** — confirmed; remediation not implemented |
| **Core gap** | Logout / `clearTokens` omit OTP binder + phone; binder deleted only on Sumsub **APPROVED** + successful `completeRegistration` |
| **Impact** | Device-local registration continuation / KYC continuation within binder TTL; durable phone PII residual after logout |

---

## 3. Actual Nexa Stays Authentication / Registration Lifecycle

Verified against code (hypothesis adjusted to repository reality):

```
OTP send (/auth/otp/send)
→ OTP verify (/auth/otp/verify)
   ├─ Existing user (tokens issued / account select) → SessionManager Bearer session → AuthAuthenticated
   └─ New user (otp_session / identity_session only)
        → write phone + otp binder (+ pending cached_user)
        → AuthOtpVerified
        → personal info / KYC submit
        → Sumsub SDK (launchSumsubVerification)
           ├─ APPROVED → completeRegistration(binder) → access+refresh → delete otp binder
           └─ not approved → binder retained
→ (Separate identity path present in repo: CreatePin / pin login — see §9/§15; not Nexa Pay)
```

There is **no** “Nexa Pay” product path. PIN pages/use-cases are **Identity** features still wired in mobile.

---

## 4. Storage Inventory

| Key / state | Store | Sensitive? | Notes |
|-------------|--------|------------|--------|
| `nexastays_access_token` | SecureStorage | Yes — Bearer access | Via `SessionManager` / `SecureStorageService` |
| `nexastays_refresh_token` | SecureStorage | Yes — refresh | Cleared by `clearTokens` / logout session clear |
| `nexastays_user_id` | SecureStorage | Identifier | Cleared by `clearTokens` |
| `nexastays_otp_session_token` | SecureStorage | Yes — registration binder JWT | **Not cleared on logout** |
| `nexastays_phone_number` | SecureStorage | Yes — PII | **Not cleared on logout** |
| `has_pin_<userId>` | SecureStorage | Low flag | Written on createPin; not cleared on logout |
| `auth_token` | SecureStorage (legacy delete only) | Stale key name | Logout deletes this; **not** the real access key name |
| `cached_user` | SharedPreferences (`LocalStorage`) | Profile / pending onboarding | Cleared on logout |
| `nexastays_device_id` | SecureStorage | Device id | Intentionally durable; not auth binder |
| In-memory SessionManager tokens | RAM | Yes | Cleared via `clearSession` |

---

## 5. Write Paths

| Key/state | Written where | Trigger | Purpose | Expected lifetime |
|-----------|---------------|---------|---------|-------------------|
| phone | `auth_repository_impl.verifyOtp` / `loginWithPin` | After OTP verify or PIN login | KYC body phone; hydration fallback | Until overwrite / account delete / **should** clear on logout (gap) |
| OTP binder | `verifyOtp` new-user branch | OTP verify returns binder, no access/refresh | Continue KYC / completeRegistration / setPin | Server ≤120m or consume; client until delete (**gap on logout**) |
| access/refresh/userId | `SessionManager.saveSession` | Successful auth hydration | PROD-SEC-001 style Bearer+refresh | Until logout / clear / rotate |
| `cached_user` | verifyOtp pending / hydrate / savePersonalInfo | Onboarding + session | Hydrate UI / AuthBloc | Cleared on logout |
| `has_pin_*` | `createPin` | After Identity `pin/set` | Local PIN-set flag | Durable residual |
| device id | `DeviceIdService` | First network need | `x-device-id` | Durable — OK |

---

## 6. Read Paths

| State | Read where | Purpose | Security consequence if stale |
|-------|------------|---------|-------------------------------|
| OTP binder | `createPin`, `launchSumsubVerification` → `completeRegistration` | Privileged registration continuation | If still valid server-side → complete KYC/reg / set PIN without new OTP |
| Phone | KYC submit, hydrate fallback, login PIN | PII for KYC APIs | Disclosure on shared device; wrong-number continuity |
| Access/refresh | AuthInterceptor / SessionManager | API auth | Cleared on logout (PASS) |
| `cached_user` | `getCachedUser` / AuthBloc start | Auto-route | Pending user → skip OTP UI if binder+cache both present (**FAIL** for abandon/restart) |

Server always re-validates binder JWT + DB row (`consumed`, `expires_at`) for minting tokens / setPin / completeRegistration.

---

## 7. Cleanup Matrix

| Lifecycle event | Access | Refresh | OTP binder | Phone | User cache | Reg/pending state |
|-----------------|:------:|:-------:|:----------:|:-----:|:----------:|:-----------------:|
| Logout | PASS (`clearSession`) | PASS | **FAIL** | **FAIL** | PASS | FAIL (binder/phone; cache cleared) |
| `clearTokens()` | PASS | PASS | **FAIL** (by design of method) | **FAIL** | N/A | N/A |
| KYC success + completeRegistration | PASS (new tokens saved) | PASS | PASS (delete) | FAIL (kept) | PASS (rewritten) | PASS binder consumed+deleted |
| KYC failure / cancel | N/A | N/A | **FAIL** (retained — may be intentional mid-flow) | FAIL | FAIL | FAIL |
| Registration complete (Sumsub path) | PASS | PASS | PASS | FAIL | PASS | PASS binder |
| createPin success | N/A | N/A | **FAIL** client delete (server **consumes**) | FAIL | N/A | Server PASS / client FAIL |
| OTP/binder expiry (server) | N/A | N/A | Client **FAIL** (stale JWT left) | FAIL | FAIL | Server rejects |
| Account switch | N/A (no clean switch wipe found) | | **FAIL** | **FAIL** | Partial | Gap |
| App restart | Hydrates tokens if present | | Binder survives | Survives | Pending → `AuthOtpVerified` | Gap if abandon |
| Account delete | PASS (`clearAll`) | PASS | PASS | PASS | PASS | PASS |
| Forced 401 refresh fail | Via interceptor/session clear patterns | | Binder untouched | Untouched | Depends | Gap |

---

## 8. OTP → KYC → Registration Lifecycle

1. New user verify → binder + phone + pending `cached_user`.  
2. `CompleteKycUseCase` → `submitKycPersonalInfo` (needs phone) → Sumsub launch.  
3. On APPROVED → `completeRegistration(otpSession)` → tokens → **delete OTP key only**.  
4. Phone key intentionally still useful for profile fallback.  
5. If KYC cancelled/failed, binder retained so user can retry — **legitimate** while they remain “in registration.” Gap is retention **after logout** and after abandon without logout if that is considered end-of-intent (product call).

---

## 9. Logout Lifecycle

```
logout()
→ deactivate push (best effort)
→ secureStorage.delete('auth_token')   // legacy key — not primary token keys
→ localStorage.remove('cached_user')
→ sessionManager.clearSession() → clearTokens() // access/refresh/userId only
→ remote logout(userId) fire-and-forget
```

**Does not clear:** `nexastays_otp_session_token`, `nexastays_phone_number`, `has_pin_*`, `nexastays_device_id`.

---

## 10. App Restart / Hydration Lifecycle

1. `SessionManager.loadSession()` restores Bearer tokens if present.  
2. `AuthCheckCachedUser` reads `cached_user`:  
   - null → `AuthUnauthenticated`  
   - KYC approved → `AuthAuthenticated`  
   - else → **`AuthOtpVerified` (isNewUser: true)** even without access token  

Combined with surviving binder: restart during abandoned registration **resumes** onboarding without OTP.

---

## 11. Account Switching

No dedicated “switch account and wipe prior registration binder” path was found. Phone + binder from user A could residual-affect a later OTP/KYC attempt on the same device until overwrite / server reject. Treat as gap for shared devices.

---

## 12. Threat Scenarios

| Scenario | Exploitable? | Local / network | Server condition | Max impact | Mitigation today |
|----------|--------------|-----------------|------------------|------------|------------------|
| A Logout after normal auth | Mostly **not** for auto session; **phone residual** yes | Local | Binder likely absent/expired if never mid-reg | PII on device; rare binder if prior abandon | Tokens+cache cleared |
| B Abandon registration | **Yes** | Local (+ server if binder valid) | Unconsumed, <120m | Resume KYC/complete without OTP | Server TTL |
| C KYC cancel | **Yes** (continue later) | Local | Unconsumed binder | Resume Sumsub/KYC | Intentional mid-flow |
| D KYC fail | **Yes** same as C | Local | Unconsumed | Retry | Intentional |
| E Expiry | Client residue **harmless** for mint | Local | Expired/consumed reject | Stale JWT/PII clutter | Server reject |
| F Restart | **Yes** if pending cache | Local | Binder valid | Skip OTP | Hydration design |
| G Account switch | **Possible** contamination | Local | Depends | Wrong phone/binder confusion | Weak |
| H Shared/stolen device | **Yes** within TTL for abandon; PII always | Local | Binder validity | Registration continuation | SecureStore ≠ user logout hygiene |
| I Reg completed | Binder deleted (PASS); phone kept | Local | Consumed | PII residual | Partial |

---

## 13. Server-Side Binder Controls

From Identity `auth.service.ts` / `otp_sessions`:

| Control | Behavior |
|---------|----------|
| What binder is | JWT `type: identity_session`/`otp_session`, `sub` = opaque DB `session_token`, claims include `phone_number` |
| TTL | **120 minutes** |
| Consume | `selectAccount`, `setPin`, `completeRegistration` (and related) set `consumed=true` |
| Logout | Revokes **refresh** tokens; **does not** revoke active `otp_sessions` rows |
| Expired/consumed | Rejected with Unauthorized / null exchange |

**Client residue ≠ automatic privilege** once expired/consumed, but **unexpired unconsumed binder is authoritative** when presented by client APIs.

---

## 14. Existing Mitigations

- FlutterSecureStorage (encrypted prefs / Keychain)  
- Server TTL + consume  
- KYC APIs require binder / phone as designed  
- Access uses Bearer via SessionManager (aligned with mobile PROD-SEC-001 analogue; not web HttpOnly cookies)  
- Account delete uses `clearAll()`  

---

## 15. False Positives / Intentionally Retained State

| State | Keep? | Why |
|-------|-------|-----|
| Binder during active KYC before logout | Yes | Required to finish Sumsub → completeRegistration |
| Phone during active registration | Yes | KYC submit |
| `nexastays_device_id` | Yes | Device header continuity |
| Phone after successful login | Optional | Profile convenience — clear on logout is still reasonable |
| Expired binder string | Harmless for auth | Should still delete for hygiene |
| Identity PIN features | In repo | **Not Nexa Pay**; do not invent Pay-specific remediation. Optional hygiene: clear binder after successful `setPin` client-side (server already consumes) |

---

## 16. Test Coverage

`nexastays-mobile/test` has **no** tests matching logout / otp binder / clearTokens / phone key cleanup.

**Gap:** suite does not prove SEC-011 cleanup.

---

## 17. Exact Security Gaps

1. Logout omits OTP binder + phone.  
2. `clearTokens()` scope too narrow for registration secrets (by design of helper; call sites must delete extra keys).  
3. Abandon/restart resumes via `cached_user` + binder without OTP.  
4. createPin consumes server binder but leaves client binder key.  
5. No cleanup on KYC cancel/failure when user leaves the flow via logout.  
6. No auth tests for residue.

---

## 18. Recommended Minimal Remediation

1. **On logout** (and any shared “full local auth wipe”): delete  
   - `nexastays_otp_session_token`  
   - `nexastays_phone_number`  
   - `has_pin_*` (optional hygiene)  
   plus existing access/refresh/userId + `cached_user`.  
   Keep `nexastays_device_id`.  

2. Prefer a single helper e.g. `clearRegistrationSecrets()` / extend logout rather than overloading `clearTokens()` silently for unrelated callers — or document and extend `clearTokens` carefully.

3. **On successful completeRegistration:** already deletes binder; also consider clearing only when appropriate; keep phone until profile load if needed, then optional clear.

4. **After successful createPin:** `delete(_otpSessionKey)` client-side (server already consumed).

5. **Do not** delete binder mid-KYC success path before `completeRegistration`.  
6. **Backend:** not required for SEC-011 close; optional later: revoke otp_sessions on logout (defense-in-depth).  
7. Abandoned registration without logout: product decision — either treat restart resume as intentional UX, or clear binder when user returns to login and starts a new OTP for another intent.

---

## 19. Required Regression Tests

1. After new-user verify, keys exist; after logout, binder+phone **gone**; access/refresh **gone**.  
2. Mid-KYC before approval: binder still present (negative: logout then binder gone).  
3. After APPROVED completeRegistration: binder gone.  
4. After createPin: binder gone client-side.  
5. Restart with pending cache+binder: document current behavior; after fix, logout then restart must not restore AuthOtpVerified from binder alone.  
6. `clearTokens` vs full wipe unit tests on `SecureStorageService`.

---

## 20. Files That Would Need Modification

- `lib/features/auth/data/repositories/auth_repository_impl.dart` (logout / createPin cleanup)  
- Possibly `lib/core/storage/secure_storage.dart` (helper for registration secret wipe)  
- Possibly `SessionManager.clear` documentation / call chaining  
- New unit tests under `test/features/auth/...`

---

## 21. Files That Must NOT Be Modified (this finding)

- Payments / CMI  
- Web / dashboard / SEC-009/010  
- VPS / deploy / CI  
- Migrations  
- Nexa Pay (nonexistent product) — do not invent PIN-as-Pay redesign  
- Unrelated booking/host features  

---

## 22. Risk Assessment

| Dimension | Rating |
|-----------|--------|
| Severity | Medium |
| Exploitability | Local device; highest for abandon/restart within ~120m |
| Network account takeover from residue alone after clean logout | Low |
| PII residual (phone) after logout | Real |
| Dogfood | Soft OK on trusted personal devices |
| Public / shared-device mobile | Should fix before launch confidence |

---

## 23. Final Verdict

**CLOSED (repository)** — remediation implemented 2026-08-11.

**Live / VPS:** **NOT VERIFIED**

Original audit-time verdict was **REMEDIATION REQUIRED**; see remediation summary at top of this document.

---

## Nexa Pay exclusion (explicit)

**Nexa Pay is not part of this audit.**  
No Nexa Pay PIN lifecycle was used to judge SEC-011.  

Repository **does** contain Identity PIN login/setup UI (`create_pin_page`, `loginWithPin`, `/auth/pin/*`). That is **Nexa Stays / Identity** code already present, not Pay. Remediation advice must not expand into inventing a Pay product; optional binder delete after `setPin` is Identity hygiene only.

---

## STOP

No code changes. No VPS. No deployment. Owner may proceed to implement the minimal logout/binder cleanup when ready.
