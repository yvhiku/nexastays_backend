# 111 / 112 — CSP + security headers (live *.nexastays.ma)

**Probe UA:** browser-like Chrome macOS  
**Surfaces:** `https://nexastays.ma`, `https://nexastays.ma/en`, `https://identity.nexastays.ma/api/v1/health`, `https://api.nexastays.ma/identity` (404 body but headers present)

## 111 CSP — PASS
- Web (`nexastays.ma` / `/en`): `Content-Security-Policy` present with restrictive defaults (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, Sumsub/API allowlists). Evidence: `111-112-nexastays-ma-headers.txt`, `111-112-nexastays-ma-en-headers.txt`.
- Identity/API: Helmet CSP present (`default-src 'self'`, `object-src 'none'`, `script-src-attr 'none'`). Evidence: `111-112-identity-health-headers.txt`, `111-112-api-identity-headers.txt`.

## 112 Security headers — PASS
Observed on web and identity/API responses:
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options` (DENY on web / SAMEORIGIN on API)
- `Referrer-Policy: no-referrer`
- `Cross-Origin-Opener-Policy: same-origin`
- Web also: `Permissions-Policy`

Note: API `frame-ancestors 'self'` / `X-Frame-Options: SAMEORIGIN` is weaker than web `none`/`DENY` but headers are present and coherent for an API.
