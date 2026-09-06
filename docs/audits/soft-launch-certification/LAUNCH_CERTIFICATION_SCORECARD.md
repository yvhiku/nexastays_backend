# Soft-Launch Certification Scorecard

**Scope:** dogfood soft-launch only  
**Frozen:** mock payments · DEMO OTP · Sumsub sandbox  
**Date:** 2026-09-06  
**Suite:** [LAUNCH_CERTIFICATION_PASSFAIL.md](LAUNCH_CERTIFICATION_PASSFAIL.md)

## Verdict

| Field | Value |
|-------|--------|
| Soft-launch verdict | **CONDITIONAL GO** |
| Blocking FAILs (SoftLaunch) | 0 code FAILs in automated subset; manual dogfood rows remain NOT_RUN |
| Conditions | Complete INF-007/008 restore drill on VPS; fill remaining SoftLaunch NOT_RUN via dogfood smoke; ops owners assigned in SOFT_LAUNCH_OPS |
| Public cutover | **Deferred** (PAY-010–012, KYC-010, OTP-008, PAYOUT-006, FAIL-006) — do not flip mock/DEMO/sandbox |

## Automated evidence executed 2026-09-06

| Command / artifact | Maps to | Outcome |
|--------------------|---------|---------|
| stays jest: `mock-payment-confirm\|payment-provider.config\|booking-state-concurrency\|booked-statuses` — **28 passed** | PAY-001–004,008; BOOK-007,014 | **PASS** |
| stays jest: `booking-pg-concurrency` — **10 skipped** (no DATABASE_URL) | BOOK-005 | **NOT_RUN** (needs PG) |
| identity jest: `auth.otp-contract\|cors-origins\|admin-kyc` — **15 passed** | OTP-001; SEC-005; KYC admin | **PASS** |
| web `journey-production-audit.test.ts` — **16 passed** | MOB-003 (+ journey chrome) | **PASS** |
| `deploy/env/dogfood*.env.example` review | PAY-001; KYC-001; OTP-001 frozen | **PASS** (`mock` / `sandbox` / DEMO comment intact) |
| Path containment code (profile photo) | SEC-008 | **PASS** (prior hardening) |
| Ops docs authored | PAYOUT-004; OBS-001; OPS-001–004 | **PASS** (doc evidence) |

## Summary counts (this run)

| Result | SoftLaunch | PublicCutover |
|--------|------------:|--------------:|
| PASS (repo / automated / doc evidence) | 52 | 0 |
| FAIL | 0 | 0 |
| BLOCKED (policy / cutover deferred) | 0 | 6 |
| N/A (email/SMS stub, counsel) | 4 | 0 |
| NOT_RUN (dogfood manual or needs PG) | 38 | 0 |

## Gap closures this cert

| Gap | Action | Doc |
|-----|--------|-----|
| Manual host payout | SOP written; flag stays false | [HOST_PAYOUT_MANUAL_SOP.md](../../ops/HOST_PAYOUT_MANUAL_SOP.md) |
| Paid but no booking | Trace runbook | [PAID_NO_BOOKING_TRACE.md](../../ops/PAID_NO_BOOKING_TRACE.md) |
| Launch ops roles | Soft-launch procedures | [SOFT_LAUNCH_OPS.md](../../ops/SOFT_LAUNCH_OPS.md) |

## SoftLaunch NOT_RUN backlog (dogfood operators)

Prioritize: smoke-dogfood-checklist #1–20, HOST-001–006 cold user, TS-001–010, INF-007/008 restore drill, MOB-001/002/004/005, PERF-001–004, FAIL-001/005.

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering | | | |
| Ops | | | |
| Trust & Safety | | | |
