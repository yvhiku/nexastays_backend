# Dogfood smoke checklist (mock payments only)

Use after `scripts/smoke.sh` passes against the dogfood base URLs.

Mark each row with the date/evidence. Do **not** mark VERIFIED without executing.

| # | Check | Result |
|---|-------|--------|
| 1 | Web loads (when web is deployed) | NOT RUN / PASS / FAIL |
| 2 | Identity `/health/live` + `/health/ready` + `/version` | |
| 3 | Stays `/health/live` + `/health/ready` + `/version` (`nexa_env=dogfood`) | |
| 4 | Registration OTP (Twilio) | |
| 5 | Login | |
| 6 | Refresh (`nexa_refresh` HttpOnly cookie; Bearer access) | |
| 7 | Logout | |
| 8 | Listing discovery (`/stays/explore`) | |
| 9 | Booking creation | |
| 10 | Payment intent (`STAYS_PAYMENT_PROVIDER=mock`) | |
| 11 | Mock confirmation | |
| 12 | Booking confirmation | |
| 13 | Cancellation | |
| 14 | Refund ledger behavior (mock) | |
| 15 | Host listing access | |
| 16 | Admin access | |
| 17 | Media upload (local disk OK in dogfood) | |
| 18 | Calendar/ICS path | |
| 19 | Database persistence across restart | |
| 20 | CORS allowlist + reject | |

Automated baseline: `bash deploy/scripts/smoke.sh` with:

```bash
export SMOKE_IDENTITY_BASE_URL=https://identity.<domain>/api/v1
export SMOKE_STAYS_BASE_URL=https://stays.<domain>/api/v1
export SMOKE_CORS_ORIGIN_OK=https://web.<domain>
export SMOKE_CORS_ORIGIN_BAD=https://evil.example
export SMOKE_EXPECT_NEXA_ENV=dogfood
```

Real-money / CMI paths: **OUT OF SCOPE**.
