# R5 final summary

Baseline after R4: 62 PASS · 0 FAIL · 88 UNVERIFIED

## Converted this wave

| ID | Result | Notes |
|----|--------|-------|
| 011 | PASS | Dogfood VPS core/freeze env key names present; soft-set missing only EMI_PROVIDER_TYPE, ENVOISMS_BASE_URL (non-core) |
| 019 | PASS | Listen inventory: public 22/80/443; PG/Redis/apps on 127.0.0.1. `ufw status` needs interactive sudo (not BatchMode) |
| 023 | PASS | FK counts Identity 25 / Stays 49; zero orphans on critical edges; orphan payment_intent INSERT rejected |
| 065 | PASS | Seeded A available / B blocked; dated explore includes A excludes B |
| 066 | PASS | City, listing_type, pets, luxury, amenity, neighborhood exact ID assertions |
| 067 | PASS | Availability endpoint empty for A; host BLOCK ranges for B |
| 073 | PASS | PAYMENT_PENDING hold → Nest `expirePendingPayments` → EXPIRED → second book succeeds |

## Still UNVERIFIED (in-scope attempt)

| ID | Why |
|----|-----|
| 022 | Identity VPS schema missing mapped entity columns / some entity-only tables; fail-closed |

## Hardening

- Unified `nexastays_db/docker-compose.yml`: `restart: unless-stopped` for identity-db, stays-db, redis
- VPS containers recreated; inspect shows `RestartPolicy=unless-stopped`; DBs ready

## Matrix after R5

**69 PASS · 0 FAIL · 81 UNVERIFIED · 0 N/A = 150**

Frozen unchanged: mock payments, DEMO OTP, Sumsub sandbox, payouts off. No deploy.
