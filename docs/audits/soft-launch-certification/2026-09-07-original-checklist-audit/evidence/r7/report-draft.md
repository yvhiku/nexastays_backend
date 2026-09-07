# Nexa Stays — Release Hardening & Certification R7

**Report date:** 2026-09-07  
**Authoritative matrix:** original attachment checklist only ([CHECKLIST.md](../CHECKLIST.md)).  
**Do not mix** R1/R2 alternate IDs.

**Scope:** live `*.nexastays.ma` security probes + dogfood mock booking notifications + VPS ops.  
**Frozen (unchanged):** `STAYS_PAYMENT_PROVIDER=mock`, DEMO OTP dogfood, `SUMSUB_MODE=sandbox`, host payouts off. **No freeze flips / no CMI / no live SMS / no Sumsub-prod.**

## Executive verdict

| Decision | Conclusion |
|---|---|
| R7 conversion wave | **12 UNVERIFIED → PASS** (security 111–119 + ops 145/147/148) |
| Still blocked this wave | Notifications 085–086, 096–100; ops 146, 149 |
| Production readiness | **NOT READY** — notification delivery broken; host metrics + backup alert unproven; CMI/SMS/Sumsub-prod/payouts remain frozen |

## Conversions (original IDs only)

| ID | New | Evidence |
|---|---|---|
| 111 | **PASS** | CSP on web + identity/API |
| 112 | **PASS** | HSTS / nosniff / frame / referrer / COOP (+ Permissions-Policy on web) |
| 113 | **PASS** | Allowed Origin ACAO; evil Origin no ACAO |
| 114 | **PASS** | OTP send forced **429** |
| 115 | **PASS** | 400/401/404 bodies without secrets/stacks |
| 116 | **PASS** | Recent identity/stays docker logs: 0 raw OTP/token/password pattern hits |
| 117 | **PASS** | SVG/EXE host media upload → 400 invalid image |
| 118 | **PASS** | SQLi-shaped city params → 400 or empty 200; no SQL leak |
| 119 | **PASS** | XSS-shaped query not executed / not raw-injected |
| 145 | **PASS** | App healthchecks + `/health/ready` `db:connected` + `pg_isready` |
| 147 | **PASS** | `docker logs` structured JSON accessible |
| 148 | **PASS** | Payment/booking error paths observable in logs; `emit-obs-event.sh` works (webhook unset on dogfood) |

## Explicitly still UNVERIFIED (this wave)

| IDs | Why |
|---|---|
| 085, 086, 096–100 | Mock book/confirm/cancel works; stays outbox + Redis emit events; notifications-service DLQ `operator does not exist: text = uuid` → `user_notifications` stays empty |
| 146 | No node_exporter / Prometheus / host metrics stack on VPS |
| 149 | `/etc/nexa/backup.env` not readable without sudo; backup-alert failure path not executed; no safe test webhook configured |

## Wave notes

### Security (111–119)
Probes under [evidence/r7/security](../evidence/r7/security/) with browser User-Agent against live `nexastays.ma` / `identity.nexastays.ma` / `api.nexastays.ma`.

### Notifications (085–086, 096–100)
Mock journey booking `3a74502c-…` confirmed then cancelled. Outbox DONE for confirm/payment; Redis also has `booking.cancelled.v1`. Consumer dead-letters confirm/payment with `text = uuid` (inbox dedupe predicate). **Do not flip SMS/email providers** until inbox query is fixed and redeployed.

### Ops (145–149)
Evidence under [evidence/r7/ops](../evidence/r7/ops/). DB health via app ready probes; logs OK; host metrics missing; backup alert unrehearsed.

## Separation from prior rounds

R7 only updates original IDs listed above. R3–R6 remain historical baselines for their conversions.

## Commits / deploy

Evidence + checklist/report update only (parent finalizes CHECKLIST). **No application deploy.**
