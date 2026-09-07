# Nexa Stays — Release Hardening & Certification R4

**Report date:** 2026-09-07  
**Authoritative matrix:** original attachment checklist only ([CHECKLIST.md](../CHECKLIST.md)).  
**Do not mix** R1/R2 alternate IDs.

**Scope:** dogfood local Identity/Stays + VPS read-only/controlled probes.  
**Frozen (unchanged):** `STAYS_PAYMENT_PROVIDER=mock`, DEMO OTP dogfood, `SUMSUB_MODE=sandbox`, host payouts off. **No deploy / no freeze flips.**

## Executive verdict

| Decision | Conclusion |
|---|---|
| R3 Gates 1–4 | Still **CLEARED** (prior round) |
| R4 conversion wave | **14 UNVERIFIED → PASS** (auth + host upload + VPS infra subset) |
| Original matrix after R4 | **62 PASS · 0 FAIL · 88 UNVERIFIED · 0 N/A = 150** |
| Production readiness | **NOT READY** — CMI, live SMS, Sumsub production, payouts, devices, and remaining infra gaps stay open |

## Conversions (original IDs only)

| ID | New | Evidence |
|---|---|---|
| 012 | **PASS** | Container upstreams use docker/internal hosts, not localhost |
| 013 | **PASS** | HTTPS + health on `*.nexastays.ma` (Cloudflare) |
| 014 | **PASS** | HTTP→HTTPS 301 on `.ma` |
| 015 | **PASS** | Cloudflare + HSTS on `.ma` |
| 016 | **PASS** | nginx `server_name` + localhost app binds |
| 017 | **PASS** | PG bound `127.0.0.1` only |
| 018 | **PASS** | Redis bound `127.0.0.1` only |
| 020 | **PASS** | App containers `unless-stopped` (DB policy `no` noted) |
| 021 | **PASS** | `schema_migrations` 41/41 Identity, 59/59 Stays |
| 024 | **PASS** | Critical unique indexes present (payments/bookings/availability) |
| 036 | **PASS** | Wrong OTP lockout HTTP + Jest |
| 038 | **PASS** | Refresh rotate / reuse revoke / logout HTTP + Jest |
| 058 | **PASS** | Unverified host draft create → 400 verification required |
| 062 | **PASS** | SVG/EXE upload → 400 invalid image |

## Explicitly still UNVERIFIED (this wave)

| IDs | Why |
|---|---|
| 011, 019 | Full env completeness checklist / firewall need root `ufw` |
| 022, 023 | Full schema equality / orphan FK audit not completed |
| 065–067, 073 | Explore smoke only; availability-correct search / lock-expire rebook journeys incomplete |
| 075–084 etc. | CMI / payouts frozen |
| Sumsub production / real SMS / devices | Frozen or physical |

## Wave notes

### Auth (036 / 038)
- Dogfood `POST /auth/verify-otp` wrong codes lock after 5 failures; DEMO blocked while locked ([036-otp-attempts](../evidence/r4/036-otp-attempts/)).
- `POST /auth/otp/verify` → refresh rotate → old refresh 401 family revoke → logout ([038-token-lifecycle](../evidence/r4/038-token-lifecycle/)).

### Product (058 / 062)
- Unverified consumer cannot create listings; unsafe media rejected ([058-062-host-upload](../evidence/r4/058-062-host-upload/)).
- Approved-host publish→public visibility and broader filter/inventory journeys remain backlog (065–067, 073).

### VPS (011–024 subset)
- Probes under [011-024-vps](../evidence/r4/011-024-vps/). Secrets redacted. `nexastays.com` Hostinger parking is **out of scope** for `.ma` soft-launch hostnames.

## Separation from R1/R2 / R3

R3 remains the Gate 1–4 hardening baseline. R4 only updates original IDs listed above. Alternate-numbered R1/R2 reports stay historical.

## Commits / deploy

Backend evidence + checklist/report update. **No deploy.**
