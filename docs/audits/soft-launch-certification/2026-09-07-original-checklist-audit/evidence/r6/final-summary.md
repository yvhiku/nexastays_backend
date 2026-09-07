# R6 parallel track — final summary

**Scope:** Host-allow (057/059–061/063–064), Admin/support (101–108), SEO (129/131–134)  
**Not in scope:** Identity schema 022 migrations; freeze flips; R1/R2 ID mixing  

## Matrix

| ID | Verdict | Evidence paths |
|---|---|---|
| 057 | **PASS** | `evidence/r6/host-allow/057-064-journey.json`, `summary.md` |
| 059 | **PASS** | same |
| 060 | **PASS** | same |
| 061 | **PASS** | same |
| 063 | **PASS** | same |
| 064 | **PASS** | `host-allow/064-explore-ok.json` (+ journey) |
| 101 | **PASS** | `evidence/r6/admin-support/101-108-probes.json`, `summary.md` |
| 102 | **PASS** | same |
| 103 | **PASS** | same |
| 104 | **PASS** | same |
| 105 | **PASS** | same |
| 106 | **PASS** | `admin-support/106-reject.json` + journey approve/live |
| 107 | **UNVERIFIED** | Guest report needs messaging conversation; admin reports list only |
| 108 | **PASS** | support ticket create + admin list |
| 129 | **PASS** | `evidence/r6/seo/129-134-final.txt`, `summary.md` |
| 131 | **PASS** | same |
| 132 | **PASS** | same |
| 133 | **PASS** | `seo/133-og-after-env-fix.txt` (after `STAYS_API_PUBLIC_URL`) |
| 134 | **PASS** | intentional listing noindex via seoScore gate; home indexed |

**Wave tally (this track):** 18 PASS · 1 UNVERIFIED · 0 FAIL  

## Code / config changes

| Change | Type |
|---|---|
| VPS `.env` `STAYS_API_PUBLIC_URL=https://api.nexastays.ma/api/v1` + stays recreate | Config (live; required for OG) |
| Web restart / Next fetch-cache clear | Ops (ISR held old OG) |
| `stays/.../seo-listing.service.ts` fallback: derive API base from `STAYS_PUBLIC_URL` | Code (repo only; not deployed this round) |
| Application image deploy | **None** |
| Identity 022 migrations | **None** (other track) |

## Freeze confirmation (post-probes)

`NEXA_ENV=dogfood`, `STAYS_PAYMENT_PROVIDER=mock`, `DEMO_OTP_CODE` set, `SUMSUB_MODE=sandbox`.
