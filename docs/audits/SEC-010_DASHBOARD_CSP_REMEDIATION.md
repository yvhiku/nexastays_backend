# SEC-010 — Dashboard CSP Remediation Report

Date: 2026-08-10  
Component: `nexastays_dashboard`  
Mode: code + test + docs only. **No VPS / deploy / CMI / payments.**

## 1. Root cause

`nexastays_dashboard/next.config.js` shipped security headers (nosniff, XFO, Referrer-Policy, Permissions-Policy, prod HSTS) but **no `Content-Security-Policy`**, leaving the admin UI without a CSP XSS depth control.

## 2. CSP policy implemented

Per-request via `middleware.ts` using `buildDashboardCsp()`:

```
default-src 'self'
script-src 'self' 'nonce-<per-request>' 'strict-dynamic'   # + 'unsafe-eval' in development only
style-src 'self' 'unsafe-inline'
img-src 'self' data: blob:
font-src 'self'
media-src 'self' blob:
connect-src 'self' <identityOrigin> <staysOrigin> [dev ws://127.0.0.1:3010 ws://localhost:3010]
frame-src 'none'
object-src 'none'
base-uri 'self'
form-action 'self'
frame-ancestors 'none'
worker-src 'self'
manifest-src 'self'
upgrade-insecure-requests   # production only
```

Static non-CSP headers remain in `next.config.js` (plus `Cross-Origin-Opener-Policy: same-origin`).

## 3. Allowed origins and why

| Origin | Source | Why |
|--------|--------|-----|
| `'self'` | always | Dashboard app + `/_next/static` (incl. self-hosted `next/font`) |
| Identity API origin | `NEXT_PUBLIC_IDENTITY_API_URL` | `lib/api/client.ts` / auth |
| Stays API origin | `NEXT_PUBLIC_STAYS_API_URL` | admin fetch / media blob downloads |
| `blob:` (img/media) | code | `URL.createObjectURL` for listing photos, ID docs, walkthrough video |
| `data:` (img) | defensive | local/data-URI images if any |
| Dev `ws://127.0.0.1:3010`, `ws://localhost:3010` | Next webpack HMR | **development only** |

**Not allowed:** Sumsub, OSM/Carto, Unsplash, Google Fonts CDN, wildcards, scheme-wide `https:`.

## 4. Is `unsafe-inline` required?

| Directive | Required? | Notes |
|-----------|-----------|--------|
| `style-src 'unsafe-inline'` | **Yes (accepted residual)** | React `style={{…}}` in charts/avatars/listings |
| `script-src 'unsafe-inline'` | **No** | Nonce + `strict-dynamic` instead |

## 5. Is `unsafe-eval` present?

| Environment | Present? |
|-------------|----------|
| Production | **NO** |
| Development | YES (webpack HMR) |

## 6. Tests added

- `lib/csp.test.cjs` via `npm run test:csp`
- Invariants: CSP present shape, `object-src`/`frame-ancestors`/`base-uri`, no prod `unsafe-eval`, no wildcards, no script `unsafe-inline`, no consumer third parties, connect-src only configured APIs

## 7. Test results

```
npm run test:csp → 7/7 pass
npm run lint → pass
next build --webpack → success (middleware/proxy present)
```

## 8. Dashboard build result

**PASS** — Next.js 16.2.12 webpack production build completed; TypeScript finished clean.

## 9. Files changed

- `nexastays_dashboard/middleware.ts` (new)
- `nexastays_dashboard/lib/csp.js`, `csp.d.ts`, `csp.test.cjs` (new)
- `nexastays_dashboard/next.config.js`
- `nexastays_dashboard/app/layout.tsx` (reads `x-nonce`)
- `nexastays_dashboard/package.json` (`test:csp`)
- `nexastays_dashboard/docs/CSP.md` (new)
- `.cursor/docs/security/csp.md`, `status.md`
- `backend/docs/audits/SEC-010_DASHBOARD_CSP_REMEDIATION.md` (this file)

## 10. Documentation changed

As listed above. SEC-010 marked **CLOSED** at repository level; live verify deferred.

## 11. Live verification status

**NOT VERIFIED** — no staging/VPS header capture in this pass.

## 12. Remaining CSP / security risks

- `style-src 'unsafe-inline'` residual (XSS can still inject styles, not scripts via script-src)
- Nonce effectiveness depends on Next applying nonces to its bootstrap scripts — build succeeds; browser enforcement to confirm on VPS
- Next 16 warns middleware convention → “proxy”; behavior still active in build output
- Consumer web CSP (`unsafe-inline` scripts / Sumsub) unchanged — out of SEC-010 scope
- SEC-008/009/011–013 still OPEN

## 13. Regression check

SEC-001–006, PROD-SEC-001, PROD-INV-001 — **not reopened** (no auth/booking/payment changes).

## 14. Final verdict

**CLOSED** (repository implementation + automated CSP invariants + production build).  
Live response-header verification remains **NOT VERIFIED**.

## STOP

Next recommended remediation (owner order): **SEC-009** (phone in registration URL). No VPS deploy.
