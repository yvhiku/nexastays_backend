# Changelog

## [Unreleased] — Backend refactor (domain boundaries, Swagger, response envelope)

### Added

- **Domain boundaries**
  - `PayDomainModule` and `GoDomainModule` under `src/domains/pay/` and `src/domains/go/` for clear Pay vs Go separation.
  - Config and database moved under `src/common/config/` and `src/common/database/`.
- **Route prefixes (backward compatible)**
  - Nexa Pay endpoints are now also exposed under `/api/v1/pay/*` (e.g. `/api/v1/pay/auth/login`, `/api/v1/pay/users/me`, `/api/v1/pay/kyc/submit`, `/api/v1/pay/admin/kyc/applications`).
  - Legacy paths remain supported: `/api/v1/auth`, `/api/v1/users`, `/api/v1/wallets`, `/api/v1/kyc`, `/api/v1/admin/*`, `/api/v1/transactions`, `/api/v1/transfers`, `/api/v1/qr`, `/api/v1/nfc`, `/api/v1/ledger`, `/api/v1/audit`.
  - Nexa Go was already under `/api/v1/go/*`; no path changes.
- **Swagger / OpenAPI**
  - Swagger UI at `/api/v1/docs`.
  - Title: Nexa API, version 1.0.
  - Bearer JWT auth supported in UI.
  - Tags: Pay Auth, Pay Users, Pay KYC, Pay Admin, Pay Wallets, Pay Transactions, Pay QR/NFC, Go Rides, Go Drivers, Go Deliveries.
  - `@ApiTags`, `@ApiBearerAuth`, and selected `@ApiOperation` / `@ApiResponse` / `@ApiConsumes` / `@ApiBody` on controllers.
- **Response envelope**
  - Success: `{ "data": ..., "meta": { "requestId": "..." }, "error": null }`.
  - Error: `{ "data": null, "meta": { "requestId": "..." }, "error": { "code": "...", "message": "...", "details": ... } }`.
- **Request ID**
  - Middleware sets `X-Request-Id` (or uses incoming `x-request-id`). Included in response `meta` and error payloads when available.
- **Structured logging**
  - Request log: method + path + requestId only (no body/headers).
  - `common/logger` helper with redaction of sensitive fields (OTP, tokens, PIN, etc.).

### Changed

- **App module**
  - Imports `DatabaseModule`, `PayDomainModule`, `GoDomainModule` (all Pay/Go modules are behind domain modules).
- **Config / database**
  - Imports from `./config` and `./database` replaced with `./common/config` and `./common/database`. Old `src/config` and `src/database` removed.
- **Exception filter**
  - HttpExceptionFilter now returns the standardized error envelope (`data`, `meta`, `error`).
- **Transform interceptor**
  - Wraps success responses in the standard envelope and adds `error: null` and optional `meta.requestId`.
- **Main**
  - Removed verbose request logging (headers/body). Added simple request log (method, path, requestId).
  - Swagger setup added; startup log points to `/api/v1/docs`.

### Fixed

- Seed script `seed-go-test-data.ts` now uses `modules/users` and `modules/wallets` entities instead of `modules/core/*`.

### Migration / breaking

- **Routes:** No breaking change. Legacy paths still work; new clients can use `/api/v1/pay/*` for Pay.
- **Response shape:** Success responses now always include `error: null` and may include `meta.requestId`. Error responses now use `{ data: null, error: { code, message, details? } }` instead of `{ statusCode, timestamp, path, message }`. Clients that parse only `data` for success and only `message` or `statusCode` for errors may need small updates.
- **Migrations:** No changes to migration files; additive only. Run existing migrations as documented in README.
