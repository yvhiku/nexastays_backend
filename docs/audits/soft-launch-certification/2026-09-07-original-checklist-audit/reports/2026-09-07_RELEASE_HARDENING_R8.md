# Nexa Stays — Release Hardening & Certification R8

**Report date:** 2026-09-07  
**Authoritative matrix:** original attachment checklist only ([CHECKLIST.md](../../CHECKLIST.md)).  
**Do not mix** R1/R2 alternate IDs.

**Scope:** dogfood-scoped performance / restart probes on `*.nexastays.ma` + local hygiene (tests + static audit).  
**Frozen (unchanged):** `STAYS_PAYMENT_PROVIDER=mock`, DEMO OTP dogfood, `SUMSUB_MODE=sandbox`, host payouts off. **No freeze flips / no CMI / no live SMS / no Sumsub-prod.**

## Executive verdict

| Decision | Conclusion |
|---|---|
| R8 conversion wave | **8 UNVERIFIED → PASS** (004, 008, 136–137, 139–141, 143) |
| Still open this wave | **138**, **142** (no prod-scale / concurrent booking harness) |
| Production readiness | **NOT READY** — scale load + concurrent booking unproven; CMI/SMS/Sumsub-prod/payouts remain frozen |

## Conversions (original IDs only)

| ID | New | Evidence |
|---|---|---|
| 004 | **PASS** | Selected suites: identity 306, stays 584 (+10 skip), web 332, dashboard 10, notifications 8; telemetry scoped out (empty) |
| 008 | **PASS** | Static audit: 0 `debugger` / 0 `TODO HACK`; residuals in legacy + seed scripts + logger sinks only |
| 136 | **PASS** | Homepage `/en` curl TTFB median ~158ms (budget &lt;2s); Lighthouse unavailable |
| 137 | **PASS** | LIVE listing page within budgets (TTFB median ~191ms) |
| 139 | **PASS** | next/image + lazy on listing page; media `Cache-Control: public, max-age=3600` |
| 140 | **PASS** | 20 sequential explore/listing GETs; p95 ~366ms (budget &lt;800ms) |
| 141 | **PASS** | Read-only EXPLAIN via `docker exec` stays-db; indexes present; sub‑ms at dogfood cardinality |
| 143 | **PASS** | Controlled `stays` compose restart; `/api/v1/health/ready` 200; DB not restarted |

## Explicitly still UNVERIFIED (this wave)

| IDs | Why |
|---|---|
| 138 | No production-scale search dataset or load profile on dogfood (4 LIVE listings) |
| 142 | No controlled concurrent booking script with stated N and pass criteria |

## Wave notes

### Perf budgets (dogfood)

Written in [perf/budgets.md](./perf/budgets.md): homepage/listing TTFB &lt;2s; explore/listing API p95 &lt;800ms. Primary homepage judged on `https://nexastays.ma/en` (root `/` is 307 locale redirect). Browser-like User-Agent used for HTTP.

### Restart (143)

`docker compose -f docker-compose.release.yml -f docker-compose.host.yml restart stays` on VPS (`nexa@72.60.133.228`). Health endpoint matches compose healthcheck: `/api/v1/health/ready`. Recovered attempt 2 (~33s wall including compose restart). DB containers `unless-stopped` and were **not** restarted. Freeze verified pre/post.

### Hygiene

`004-test-matrix.txt` + `hygiene/` logs. Static ripgrep in `008-hygiene-audit.txt`. No emergency code fixes; residuals documented for backlog.

## Separation from prior rounds

R8 only updates original IDs listed above. R3–R7 remain historical baselines for their conversions.

## Commits / deploy

Evidence + checklist/report update only (parent finalizes CHECKLIST / formal report). **No application deploy.**
