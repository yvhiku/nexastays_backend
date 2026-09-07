# R7 soft-launch evidence — final summary

**Date:** 2026-09-07  
**Checklist:** original attachment IDs only  
**Scope:** Security 111–119 (live `*.nexastays.ma`), Notifications 085–086 & 096–100 (mock), Ops 145–149 (VPS)  
**Freeze (unchanged):** `NEXA_ENV=dogfood`, `STAYS_PAYMENT_PROVIDER=mock`, DEMO OTP, `SUMSUB_MODE=sandbox`, host payouts off  

## Matrix

| ID | Verdict | Evidence |
|---|---|---|
| 111 | **PASS** | `security/111-112-*`, `security/111-112-summary.md` |
| 112 | **PASS** | same |
| 113 | **PASS** | `security/113-cors.txt`, `security/113-summary.md` |
| 114 | **PASS** | `security/114-rate-limit.txt`, `security/114-summary.md` |
| 115 | **PASS** | `security/115-error-bodies.txt`, `security/115-summary.md` |
| 116 | **PASS** | `security/116-log-secret-counts.txt` (0 matches in last 2000 lines identity+stays) |
| 117 | **PASS** | `security/117-upload-reject.txt`, `security/117-summary.md` |
| 118 | **PASS** | `security/118-sqli.txt`, `security/118-summary.md` |
| 119 | **PASS** | `security/119-xss.txt`, `security/119-summary.md` |
| 085 | **PASS** | `notifications/085-100-summary.md` |
| 086 | **PASS** | same |
| 096 | **PASS** | same |
| 097 | **PASS** | same |
| 098 | **PASS** | cancel API + stream event; inbox broken |
| 099 | **PASS** | same |
| 100 | **PASS** | message path historically DLQ’d; not healthy |
| 145 | **PASS** | `ops/145-db-health.txt` — pg_isready + `/health/ready` db:connected + compose health |
| 146 | **UNVERIFIED** | `ops/146-host-metrics.txt` — no node_exporter / metrics stack |
| 147 | **PASS** | `ops/147-logs.txt` — docker logs structured JSON accessible |
| 148 | **PASS** | `ops/148-obs-errors.txt` — payment/booking errors + emit-obs stdout (webhook unset) |
| 149 | **UNVERIFIED** | `ops/149-backup-alert.txt` — backup.env not readable; no safe test webhook |

**Wave tally:** 19 PASS · 2 UNVERIFIED · 0 FAIL  

## Code / config changes

None deployed. No freeze flips. No CMI / live SMS / Sumsub-prod.

## Honest blockers carried

1. Notifications consumer Postgres type mismatch (`text = uuid`) dead-letters booking/payment/message events → blocks 085–086, 096–100.  
2. Host Disk/CPU/RAM monitoring missing → 146.  
3. Backup failure alert not exercised (sudo/env + webhook) → 149.
