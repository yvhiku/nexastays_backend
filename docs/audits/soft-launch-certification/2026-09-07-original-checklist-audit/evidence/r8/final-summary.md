# R8 soft-launch evidence — final summary

**Date:** 2026-09-07  
**Checklist:** original attachment IDs only  
**Scope:** Perf/restart dogfood (136–143) + hygiene 004/008  
**Freeze (unchanged):** `NEXA_ENV=dogfood`, `STAYS_PAYMENT_PROVIDER=mock`, DEMO OTP, `SUMSUB_MODE=sandbox`, host payouts off  

## Matrix

| ID | Verdict | Evidence |
|---|---|---|
| 004 | **PASS** | `004-test-matrix.txt`, `hygiene/004-*-test.txt` — 1240 tests passed (identity 306, stays 584, web 332, dashboard 10, notifications 8); telemetry empty suite scoped out |
| 008 | **PASS** | `008-hygiene-audit.txt` — 0 debugger / 0 HACK bypass in prod paths; residuals quarantined (legacy go-delivery + seed scripts + logger sinks) |
| 136 | **PASS** | `perf/budgets.md`, `perf/136-homepage-timing.txt`, `perf/136-137-summary.txt` — `/en` median TTFB ~158ms / total ~425ms (budget TTFB&lt;2s); Lighthouse N/A |
| 137 | **PASS** | `perf/137-listing-timing.txt` — LIVE listing median TTFB ~191ms / total ~447ms |
| 138 | **UNVERIFIED** | `perf/138-142-unverified.txt` — no production-scale search load harness (4 LIVE listings) |
| 139 | **PASS** | `perf/139-image-loading.txt` — next/image + lazy; listing media `Cache-Control: public, max-age=3600` |
| 140 | **PASS** | `perf/140-api-p95.txt` — 20 sequential explore/listing GETs; p95 ~366ms (budget &lt;800ms) |
| 141 | **PASS** | `perf/141-explain.txt` — read-only EXPLAIN on `stays-db`; sub‑ms plans; LIVE indexes present |
| 142 | **UNVERIFIED** | `perf/138-142-unverified.txt` — no controlled concurrent booking script (unit concurrency ≠ this) |
| 143 | **PASS** | `restart/143-stays-restart.txt` — `docker compose … restart stays`; `/api/v1/health/ready` 200 ~33s wall incl. compose; DB not restarted; freeze unchanged |

**Wave tally:** 8 PASS · 2 UNVERIFIED · 0 FAIL  

## Code / config changes

None. No freeze flips. Evidence-only under `evidence/r8/`.

## Honest gaps carried

1. **138 / 142** — production-scale search and concurrent booking remain unproven.  
2. **008 residuals** — legacy Go-Delivery / Go-Taxi `console.log` noise still in identity tree (not soft-launch surface).  
3. **141** — dogfood DB has only 4 LIVE listings; plans do not certify large-scale explore.
