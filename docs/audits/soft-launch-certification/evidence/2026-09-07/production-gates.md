# Production gates remaining (R2)

Locked scope: local/dogfood. These MUST remain UNVERIFIED until explicitly authorized.

## Payments (CMI production)
- 010 Live PreAuth redirect
- 011 HMAC callback verify (production credentials)
- 012 Duplicate/late webhook (production)
- 128 PublicCutover failure modes

## KYC (Sumsub production)
- 022 SUMSUB_MODE=live

## Communications
- 030 Real SMS provider delivery
- 029 note: log hygiene PASS does **not** clear 030

## Payouts
- 080 Enable host payout settlement

## Deployed infrastructure / CSP
- 091 Deployed-production CSP (local header probe ≠ certification)
- 096 HTTPS/TLS everywhere
- 097 Public port exposure
- 098 Public DB not exposed
- 099 identity+stays /ready on deployed host
- 100 Restart policy on deployed host
- 106 /version nexa_env on deployed host

## Devices
- 114 Safari real device
- 115 Android real device
- 117 Real device keyboard

## Cutover rehearsal
- 149 Production forbids DEMO_OTP; requires cmi + live Sumsub + SMS

## SoftLaunch partials still UNVERIFIED (not production, but incomplete under integrity rules)
- 007 Admin payment **UI** (API alone insufficient)
- 015 Sumsub **widget E2E**
- 021 KYC reject/retry **UX**
- 028 OTP late-verify fail (DEMO OTP bypasses expiry by design in dogfood)
- 038 Hold-expiry **alert** path
- 045/046 Full host cold-path UI
- 050 Host sees **mock booking** in inbox (endpoint empty for consumer JWT)
- 064 Admin **user suspend → access blocked** (listing_frozen covered separately; not full suspend)
- 119 Lighthouse (Chrome not installed on this workstation)
