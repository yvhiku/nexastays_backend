# Nexa Stays — Release Hardening & Certification R6

**Report date:** 2026-09-07  
**Authoritative matrix:** original attachment checklist only.  
**Freeze unchanged:** mock payments, DEMO OTP, Sumsub sandbox, host payouts off.

## Executive verdict

| Decision | Conclusion |
|---|---|
| R6 conversion | **19 UNVERIFIED → PASS**; **107 remains UNVERIFIED** |
| Matrix after R6 | **88 PASS · 0 FAIL · 62 UNVERIFIED** |
| Soft-launch leave-behind | Still intentional: 075–084, 049–054, 095, 090–094 |

## Conversions

| IDs | Result | Notes |
|---|---|---|
| 022 | PASS | Identity 067/068 + Stays 057 applied; zero missing mapped columns |
| 057,059–061,063–064 | PASS | Host allow journey on dogfood |
| 101–106,108 | PASS | Admin/support API probes |
| 129,131–134 | PASS | Live SEO crawl; OG fixed via `STAYS_API_PUBLIC_URL` |
| 107 | UNVERIFIED | Guest report needs messaging conversation |

## Evidence

`evidence/r6/{022-schema,host-allow,admin-support,seo}/`

## Commits / deploy

DB migrations committed + applied on VPS. Stays SEO public-URL fallback in repo. **No freeze flips.** No full app image redeploy required beyond stays recreate for env URL.
