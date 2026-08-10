# NEXA STAYS — PROD-SEC-001 REMEDIATION REPORT

## 1. Finding
PROD-SEC-001 — Cookie/session model (ADR-005 deviation: ambient `nexa_access` + hybrid Stays auth)

## 2. Root Cause
Identity issued HttpOnly `nexa_access` when `X-Auth-Transport: cookie`, and Stays/Identity JWT strategies accepted Bearer **or** that cookie. Web clients often relied on credentialed requests without attaching in-memory Bearer, creating an ambiguous ambient-cookie authorization path that conflicted with ADR-005.

## 3. Chosen Authentication Model

| Concern | Model |
|---------|-------|
| Web access JWT | In-memory only |
| Web API auth | `Authorization: Bearer` |
| Refresh | HttpOnly `nexa_refresh` (Secure in prod, SameSite=Lax) |
| Access cookie `nexa_access` | **Not issued**; cleared; **not accepted** for API auth |
| Logout | Refresh cookie revoke + clear cookies + clear memory |
| CSRF | Origin allowlist + SameSite on cookie mutations (refresh/logout); Bearer not ambient |
| Mobile | Unchanged SecureStore + Bearer |
| Dashboard | In-memory Bearer + refresh cookie transport |

## 4. Files Changed

| Area | Change |
|------|--------|
| Identity cookies/interceptor | Refresh-only Set-Cookie; clear access |
| Identity/Stays JWT | Bearer-only extractors |
| Web clients | Memory token store + Bearer interceptors |
| Docs/ADR-005 | Aligned; deviation closed |

## 5–7. Security / CSRF / Compatibility
See ADR-005 and `cookies.md` / `csrf.md`. Mobile untouched. Dashboard still Bearer.

## 8. Regression Tests
Identity: bearer extract, cookie flags, browser cookies. Stays: bearer vs ambient cookie. Web: static transport tests. Cookie CSRF specs remain.

## 9. Build Results
Reported in commit notes after `npm test` / `npm run build` on affected packages.

## 10. ADR / Documentation
ADR-005 conformance **ALIGNED**. status.md PROD-SEC-001 **CLOSED**.

## 11. Remaining Risks
- Refresh/logout still cookie-based → rely on Origin+SameSite (SEC-013 P3 hardening optional).
- No full browser E2E in CI for cookie ambient rejection (unit/static coverage instead).
- Legacy browsers may still hold old `nexa_access` until cleared on next auth/logout.

## 12. Verification Limitations
- Unit/static: VERIFIED for extractor and issuance behavior.
- Browser E2E ambient cookie: **DEFERRED** / IMPLEMENTED — NOT VERIFIED at E2E layer.
- Staging deploy cookie flags: NOT VERIFIED in live environment.

## 13. Final Verdict

**PROD-SEC-001 — CLOSED**
(architecture ambiguity resolved; regression tests for Bearer-only extraction and non-issuance of access cookie pass. Browser E2E ambient attack not run — residual verification limitation, not an open architecture conflict.)
