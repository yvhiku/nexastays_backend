# UNVERIFIED classification (R2) — 46 IDs

Date: 2026-09-07  
Scope: local/dogfood only. Frozen: mock · DEMO OTP · sandbox · payouts off.

| ID | Category | Notes |
|----|----------|-------|
| 005 | A | Payment hold expiry scheduler |
| 007 | B | Admin payment UI required; API alone ≠ PASS |
| 010 | C | CMI production PreAuth |
| 011 | C | CMI production HMAC callback |
| 012 | C | CMI production webhook replay |
| 015 | B | Sandbox widget E2E; API alone ≠ PASS |
| 021 | B | Reject/retry UX; API alone ≠ PASS |
| 022 | C | Sumsub production |
| 024 | A | Dogfood DEMO OTP send |
| 027 | B | OTP send rate-limit harness |
| 028 | B | OTP TTL/expiry harness |
| 029 | A | Log hygiene only (not SMS delivery) |
| 030 | C | Real SMS provider |
| 031 | A | Explore UI/API smoke |
| 032 | A | Dates/guests booking UI smoke |
| 038 | B | Hold expiry alert path |
| 045 | B | Host cold register |
| 046 | B | Host verify path |
| 050 | A | Host booking inbox API |
| 064 | B | Admin suspend/freeze access block |
| 067 | B | BOOKING_CONFIRMED mapper |
| 068 | B | PAYMENT_SUCCEEDED mapper |
| 069 | B | BOOKING_CANCELLED dual mapper |
| 070 | A | MESSAGE_RECEIVED mapper |
| 076 | A | Host pending payout Σ (service) |
| 080 | C | Production host payouts |
| 089 | A | Cookie HttpOnly dogfood |
| 091 | C | Deployed CSP (local probe ≠ PASS) |
| 092 | A | Upload oversize reject |
| 096 | C | Deployed TLS |
| 097 | C | Public port exposure |
| 098 | C | Public DB exposure |
| 099 | C | Deployed /ready |
| 100 | C | Deployed restart policy |
| 106 | C | Deployed /version |
| 110 | A | Canonical/metadata |
| 113 | A | Indexable listing spot-check |
| 114 | D | Real Safari device |
| 115 | D | Real Android device |
| 117 | D | Real device keyboard |
| 119 | A | Lighthouse mobile record |
| 120 | A* | Attempt; PASS only if criterion matches measured metric |
| 121 | A* | Attempt; need rendered lazy behavior |
| 122 | A* | Attempt; scale threshold required |
| 128 | C | PublicCutover failure modes |
| 149 | C | Production cutover gates rehearsal |

\* Attempt + honest status — may remain UNVERIFIED.

## Counts

| Category | Count |
|----------|------:|
| A (incl. A*) | 17 |
| B | 12 |
| C | 14 |
| D | 3 |
| **Total** | **46** |
