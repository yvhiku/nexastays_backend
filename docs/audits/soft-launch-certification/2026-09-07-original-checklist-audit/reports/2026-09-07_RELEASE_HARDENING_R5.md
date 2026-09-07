# Nexa Stays — Release Hardening & Certification R5

**Report date:** 2026-09-07  
**Authoritative matrix:** original attachment checklist only ([CHECKLIST.md](../CHECKLIST.md)).  
**Do not mix** R1/R2 alternate IDs.

**Scope:** dogfood VPS convertible UNVERIFIED items only (env/firewall/schema/FK/search/lock) + DB restart align.  
**Frozen (unchanged):** `STAYS_PAYMENT_PROVIDER=mock`, DEMO OTP dogfood, `SUMSUB_MODE=sandbox`, host payouts off. **No deploy / no freeze flips.**

## Executive verdict

| Decision | Conclusion |
|---|---|
| R3 Gates 1–4 | Still **CLEARED** |
| R5 conversion wave | **7 UNVERIFIED → PASS**; **022 remains UNVERIFIED** (fail-closed) |
| Original matrix after R5 | **69 PASS · 0 FAIL · 81 UNVERIFIED · 0 N/A = 150** |
| Production readiness | **NOT READY** — CMI, live SMS, Sumsub production, payouts, devices, Identity schema drift (022) remain open |

## Conversions (original IDs only)

| ID | New | Evidence |
|---|---|---|
| 011 | **PASS** | Dogfood `.env` key-name completeness vs soft/core set ([011-019-infra](../evidence/r5/011-019-infra/)) |
| 019 | **PASS** | Listen inventory public 22/80/443; sensitive ports localhost-only. `ufw` needs interactive sudo |
| 023 | **PASS** | FK enumerate + zero orphans + reject orphan payment_intent ([022-023-schema](../evidence/r5/022-023-schema/)) |
| 065 | **PASS** | Seeded A/B inventory; dated explore A in / B out ([065-073](../evidence/r5/065-073-search-booking/)) |
| 066 | **PASS** | Primary filters with exact seeded ID sets |
| 067 | **PASS** | Availability HTTP matches blocks/bookings inventory |
| 073 | **PASS** | PAYMENT_PENDING → `expirePendingPayments` → EXPIRED → second book |

## Explicitly still UNVERIFIED (this wave)

| IDs | Why |
|---|---|
| 022 | Identity VPS missing mapped entity columns / entity-only tables; Stays deployed surface clean — fail-closed |
| 075–084 etc. | CMI / payouts frozen |
| Sumsub production / real SMS / devices | Frozen or physical |

## Hardening

- Repo + VPS unified `nexastays_db/docker-compose.yml`: `restart: unless-stopped` for identity-db, stays-db, redis.
- VPS containers recreated (no `-v`); inspect `RestartPolicy=unless-stopped`; PG/Redis ready ([db-restart](../evidence/r5/db-restart/)).
- No full host reboot in this wave. `nexastays.com` parking remains out of scope for `.ma` soft-launch.

## Wave notes

### Infra (011 / 019 / 023)
- Key-name-only diff (no secret values). Soft-set gaps EMI/EnvoiSMS URLs are non-core for dogfood freeze.
- Firewall PASS rests on listen inventory when BatchMode cannot elevate for `ufw`.

### Search / lock (065–067 / 073)
- Controlled seed listings `a1111111-…101` / `b2222222-…202` on dogfood Stays.
- Expire invoked via Nest application context calling private `expirePendingPayments` (same service as hourly cron); Jest scheduler guards retained.

### Schema (022)
- Honest UNVERIFIED: Identity dogfood schema lags entity definitions. Do not invent PASS.

## Separation from R1/R2 / R3 / R4

R4 remains the prior conversion baseline (62 PASS). R5 only updates original IDs listed above. Alternate-numbered R1/R2 reports stay historical.

## Commits / deploy

Backend evidence + checklist/report update; DB compose restart align. **No deploy.**
