# SEC-009 — Registration phone URL remediation

Date: 2026-08-11  
Component: `nexastays_web`  
Scope: SEC-009 only.

## 1. Root cause

`app/[locale]/login/page.tsx` built registration URLs with  
`?phone=${encodeURIComponent(phone)}` on the OTP→registration branch and the 404/not-found branch.  
`registration/page.tsx` read `searchParams.get("phone")`, putting full MSISDNs into history, copied links, screenshots, and logs.

## 2. Transport chosen

**In-memory module store** (`lib/registration-phone-store.ts`), same pattern as `access-token-store` (PROD-SEC-001).

| Allowed | Forbidden |
|---------|-----------|
| SPA heap `setRegistrationPhone` / `getRegistrationPhone` | URL query / fragment |
| Fallback: `phone_number` claim inside existing **otp_session** JWT (already in sessionStorage for SEC-008) | `localStorage` |

Cleared on: `setAuthJwt`, logout, `clearStoredTokens`.

## 3. Files changed

- `lib/registration-phone-store.ts` (new)
- `app/[locale]/login/page.tsx`
- `app/[locale]/registration/page.tsx`
- `contexts/AuthContext.tsx`
- `lib/__tests__/sec-009-registration-phone-url.test.ts` (new)
- `.cursor/docs/security/status.md`
- `backend/docs/audits/SEC-009_REGISTRATION_PHONE_URL_REMEDIATION.md` (this file)
- `backend/docs/audits/P3_SECURITY_AUDIT_SEC_008_013.md` (table status)

## 4. Behaviour notes

- Registration with `?redirect=` only (no phone) still works; unauthenticated users redirect to login.
- JWT+onboarding registration path relies on Identity profile (`phone_number`) after `setAuthJwt` clears memory phone.
- OTP-session path keeps memory phone; tab refresh can recover from binder JWT claim.
- Direct `/registration` without phone/session: existing login redirect; no URL phone leak.
- Backend `phone_number` JSON APIs unchanged.

## 5. Tests / build

```
npx tsx --test lib/__tests__/sec-009-*.test.ts (+ auth/onboarding + prod-sec-001) → pass
npm run lint → pass
npm run build → pass
```

Repo-wide static scan excludes `.next` / `.next-dev`.

## 6. Remaining limitations

- Phone still present inside client-held `identity_session` JWT payload (SEC-008 residual), not in URLs.
- 404→registration without OTP binder remains a soft path (redirects to login without auth); no longer puts phone in the URL.
- Live referrer/log verification on VPS: **NOT VERIFIED**.

## 7. Verdict

**CLOSED** (repository-wide construction/read of registration `phone=` removed; automated regressions green).  
Live environment: **NOT VERIFIED**.

## STOP

Next owner item: **SEC-011** (mobile logout residue). No VPS / CMI.
