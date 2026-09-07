# Code changes (R2 audit)

## File: identity/src/modules/auth/otp-send-rate-limit.service.spec.ts
- **Change:** Added unit tests for per-minute OTP send rate limit.
- **Reason:** Execute audit 027 with evidence.
- **Audit ID:** 027
- **Why minimal:** Spec-only; no production behavior change.

## File: identity/src/modules/auth/otp-lockout.service.spec.ts
- **Change:** Import Jest globals from `@jest/globals` (IDE/tsc hygiene).
- **Reason:** Clear IDE errors; tests already existed from R1.
- **Audit ID:** n/a (hygiene)
- **Why minimal:** Import-only.

## File: platform/notifications-service/src/notification-mapper.spec.ts
- **Change:** Added BOOKING_CONFIRMED, PAYMENT_SUCCEEDED, BOOKING_CANCELLED mapper cases.
- **Reason:** Execute audits 067–069 with evidence.
- **Audit IDs:** 067, 068, 069
- **Why minimal:** Spec-only extensions.

## File: stays/src/modules/stays/hosts/hosts.upload-oversize.spec.ts
- **Change:** Unit test calling `HostsService.uploadDocumentFront` with >5MB file.
- **Reason:** Execute audit 092 service-level reject (paired with web client tests).
- **Audit ID:** 092
- **Why minimal:** Spec-only; invokes real service method.

## Ops (not code): identity DB
- Applied `ADD COLUMN IF NOT EXISTS last_provider_event_at` on dogfood `nexastays_db-identity-db-1` to unblock OTP verify (dirty entity vs schema drift). Additive only; matches pending migration 067.
- **Audit IDs:** 089 (and dogfood auth flows)
- **Why minimal:** Schema align only; no business-rule change.

## Not changed (frozen)
- STAYS_PAYMENT_PROVIDER=mock
- DEMO OTP / NEXA_ENV=dogfood
- SUMSUB_MODE=sandbox
- STAYS_HOST_PAYOUT_ENABLED unset/false
- No eslint --fix, no deploy, no live integrations
