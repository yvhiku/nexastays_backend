# R6 Host-allow journey (057, 059–061, 063–064)

**Date:** 2026-09-07  
**Surface:** HTTPS dogfood `identity.nexastays.ma` / `api.nexastays.ma`  
**Auth:** DEMO OTP (`phone_number` + `otp`), browser User-Agent  
**Freeze unchanged:** `STAYS_PAYMENT_PROVIDER=mock`, DEMO OTP, `SUMSUB_MODE=sandbox`, host payouts off  

## Journey result

| Step | Result |
|---|---|
| OTP send/verify | PASS |
| KYC for host reuse | Dogfood DB seed (`users.kyc_status` + `kyc_profiles` VERIFIED/BASIC) + Redis snapshot invalidate — Sumsub UI not exercised |
| `POST /stays/host/onboarding` | PASS (201 PENDING) |
| Admin approve host | PASS (201) via provisioned staff `POST /auth/admin/login` |
| Create listing draft | PASS (201) |
| Invalid listing_type | PASS (400) |
| JPEG×5 upload + media replace | PASS |
| Submit → admin approve → set-live | PASS |
| Explore visibility | PASS (`GET /stays/explore?limit=20`; note `limit` max **48**) |
| Public listing GET | PASS (LIVE) |

**Probe listing id:** `89563d40-4b2f-4b4e-8f52-4905878db359`

## ID verdicts

| ID | Verdict | Evidence |
|---|---|---|
| 057 | **PASS** | `057-064-journey.json` onboarding + admin approve |
| 059 | **PASS** | create + patch listing |
| 060 | **PASS** | invalid/missing `listing_type` → 400 |
| 061 | **PASS** | five JPEG uploads + `PUT .../media` |
| 063 | **PASS** | submit → approve → set-live |
| 064 | **PASS** | `064-explore-ok.json` + public GET |

## Notes / blockers cleared

- First attempt blocked by KYC (`Identity verification required`) until profile seeded — documented in journey JSON.
- Admin allowlist password is env `ADMIN_PASSWORD_HASH` (not printed). Probes used ephemeral `staff_password_hash` ADMIN user (`@nexastays.probe.local`), then disabled.
- Tokens/OTP redacted in evidence JSON.
