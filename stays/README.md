# Nexa Backend

NestJS + PostgreSQL monorepo for **Nexa Pay** (wallet, auth, KYC, admin, transactions) and **Nexa Go** (taxi + delivery: rides, drivers, orders, dispatch).

- **Base URL:** `/api/v1`
- **Swagger:** `/api/v1/docs`
- **Domain boundaries:** Pay under `pay/` (and legacy paths), Go under `go/`

---

## Quick start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm

### 1. Install and run

```bash
cd backend
npm install
npm run start:dev
```

API: `http://localhost:3000/api/v1`  
Swagger: `http://localhost:3000/api/v1/docs`

### 2. Environment variables

Create a `.env` in `backend/` (or set in the shell):

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | `development` / `production` / `test` | `development` |
| `API_PREFIX` | Base path for API | `api/v1` |
| `JWT_SECRET` | Secret for JWT signing | (set in production) |
| `JWT_EXPIRES_IN` | JWT expiry | `15m` |
| `DEMO_OTP_CODE` | Demo OTP for development | `123456` |
| `OTP_EXPIRY_SECONDS` | OTP validity | `300` |
| `PIN_MAX_ATTEMPTS` | Max PIN retries before lockout | `5` |
| `PIN_ATTEMPT_WINDOW_MINUTES` | Window for counting retries | `15` |
| `PIN_BASE_LOCKOUT_SECONDS` | First lockout duration | `60` |
| `PIN_MAX_LOCKOUT_SECONDS` | Max exponential lockout cap | `3600` |
| `FCM_SERVICE_ACCOUNT_JSON` | Firebase service account JSON (stringified) | — |
| `FCM_SERVICE_ACCOUNT_PATH` | Path to Firebase service account JSON | — |
| `KYC_HASH_PEPPER` | Pepper for CNIE hashing (production required) | — |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USERNAME` | DB user | `postgres` |
| `DB_PASSWORD` | DB password | `nexa123` |
| `DB_NAME` | Database name | `nexapay` |
| `DAILY_TRANSFER_LIMIT` | Pay daily limit | `10000` |
| `MONTHLY_TRANSFER_LIMIT` | Pay monthly limit | `100000` |
| `MAX_SINGLE_TRANSFER` | Pay max single transfer | `5000` |

In **production**, set `JWT_SECRET` and `KYC_HASH_PEPPER`; do not rely on defaults.

### PIN hash migration strategy

- New/updated PINs are stored with **Argon2id**.
- Existing users with legacy bcrypt hashes are migrated **on successful PIN verification**.
- The migration is transparent to clients: user logs in once with the correct PIN, backend rehashes and stores Argon2id.
- Lockout telemetry is audited with `PIN_VERIFY_FAILED` and `PIN_LOCKOUT` events.

### 3. Database setup and migrations

- **Local Docker DB (required):** Any schema change must be applied to the Docker Postgres (`nexa-db`, port `5433`). From `backend/`:
  ```bash
  npm run migrate:docker
  ```
  Single file: `npm run migrate:docker -- -File 046_my_change.sql`

  **Existing database (already has tables)?** Run once to record current migrations without re-executing SQL:
  ```bash
  npm run migrate:docker:baseline
  ```
  Then use `npm run migrate:docker` only for **new** migration files.

  Start Docker if needed: `cd ../infra && docker compose -f docker-compose.db.yml up -d`

- **Development:** TypeORM may use `synchronize: true` when `NODE_ENV=development`, but prefer SQL migrations to avoid startup failures on existing data.
- **Production:** Use **migrations only**. Do not use `synchronize: true`.

Migrations live in `database/migrations/` as SQL files:

- `001_create_go_schema.sql` — Go (rides, drivers) schema and tables
- `002_add_ride_pricing_and_driver_documents.sql`
- `003_create_go_delivery_schema.sql` — Delivery orders, merchants, menus
- `004_kyc_profile_document_urls.sql` — KYC document URLs
- `005_kyc_profile_front_back_metadata.sql` — KYC front/back metadata
- `006_waitlist_entries.sql`
- `007_add_user_profile_photo.sql`
- `008_refresh_tokens.sql`
- `009_otp_attempts.sql` — OTP failure lockout
- `010_pin_attempts.sql` — PIN failure lockout + exponential backoff
- `011_trusted_devices.sql` — Account trusted device binding
- `012_push_device_tokens.sql` — Push device token registry

Run them in order against your DB (e.g. with `psql` or your migration runner). Ensure the `core` schema and tables (users, wallets, etc.) exist as expected by the Go schema (e.g. `core.users`).

```bash
# Example: run migrations with psql
psql -U postgres -d nexapay -f database/migrations/001_create_go_schema.sql
# ... then 002, 003, 004, 005
```

---

## Troubleshooting: "Connection refused" from mobile app

If the backend works in the browser (e.g. `http://localhost:3000/api/v1/docs`) but the **NexaGO or NexaDriver app on a physical device** shows **Connection refused** to `http://192.168.x.x:3000`:

1. **Backend listens on all interfaces**  
   The server is already set to listen on `0.0.0.0` (see `main.ts`), so it accepts connections from other devices. No change needed there.

2. **macOS Firewall**  
   The firewall may be blocking **incoming** connections to port 3000 from the phone.
   - **System Settings → Network → Firewall** (or **Security & Privacy → Firewall**): either turn the firewall off temporarily to test, or add an rule to allow incoming connections for **Node** (or the process you use to run the backend).
   - After allowing Node, try the app again.

3. **Correct IP in the app**  
   The phone must use your computer’s **current** LAN IP. On Mac (Wi‑Fi): `ipconfig getifaddr en0`. Put that IP in the app’s `.env` as `API_BASE_URL=http://<that-IP>:3000/api/v1` (NexaGO and NexaDriver both read this).

4. **Same network**  
   Phone and computer must be on the same Wi‑Fi (not guest network). Some routers isolate guest networks from the main LAN.

5. **Verify from the phone’s network**  
   From another device on the same Wi‑Fi (or your phone’s browser), open `http://<your-mac-IP>:3000/api/v1/docs`. If that fails, the problem is network/firewall, not the app.

---

## API structure

### Route prefixes

- **Nexa Pay (new):** `/api/v1/pay/*`  
  - e.g. `/api/v1/pay/auth/login`, `/api/v1/pay/users/me`, `/api/v1/pay/kyc/submit`, `/api/v1/pay/admin/kyc/applications`
- **Nexa Pay (legacy, still supported):** `/api/v1/auth`, `/api/v1/users`, `/api/v1/wallets`, `/api/v1/kyc`, `/api/v1/admin/*`, etc.
- **Nexa Go:** `/api/v1/go/*`  
  - e.g. `/api/v1/go/rides`, `/api/v1/go/drivers`, `/api/v1/go/delivery/orders`, `/api/v1/go/delivery/merchants`

### Response envelope (opt-in)

By default, responses are **legacy** (no wrapping): the body is the raw payload so existing mobile clients keep working.

The response envelope is **opt-in** via header:

- **Header:** `x-api-envelope: 1` (or `x-api-envelope: true`, case-insensitive)
- **With envelope — success:** `{ "data": ..., "meta": { "requestId": "..." }, "error": null }`
- **With envelope — error:** `{ "data": null, "meta": { "requestId": "..." }, "error": { "code": "...", "message": "...", "details": ... } }`
- **Without header (default):** response body is the raw payload; errors use `{ statusCode, timestamp, path, message[, code] }`.

**Examples:**

```bash
# Legacy (default) — root-level keys, e.g. access_token
curl -s -X POST http://localhost:3000/api/v1/auth/verify-pin \
  -H "Content-Type: application/json" \
  -d '{"phone_number":"+212612345678","pin":"1234","account_type":"CONSUMER"}' | jq .
# → { "verified": true, "access_token": "...", "expires_in": "15m", "account_type": "CONSUMER" }

# Envelope (opt-in) — same response wrapped in data/meta/error
curl -s -X POST http://localhost:3000/api/v1/auth/verify-pin \
  -H "Content-Type: application/json" \
  -H "x-api-envelope: 1" \
  -d '{"phone_number":"+212612345678","pin":"1234","account_type":"CONSUMER"}' | jq .
# → { "data": { "verified": true, "access_token": "...", "expires_in": "15m", "account_type": "CONSUMER" }, "meta": { "requestId": "..." }, "error": null }
```

In envelope mode, `meta.requestId` is always present (empty string if none was set).

### Error code taxonomy (envelope mode)

When using `x-api-envelope: 1`, errors include `error.code`. Use these for client-side handling:

| Code | HTTP status | Meaning |
|------|-------------|---------|
| `VALIDATION_ERROR` | 400 | Request body or query failed validation (e.g. class-validator). Check `error.details` for field-level messages. |
| `BAD_REQUEST` | 400 | Generic bad request (invalid input, business rule). |
| `UNAUTHORIZED` | 401 | Missing or invalid auth (e.g. no/invalid JWT, wrong PIN). |
| `FORBIDDEN` | 403 | Authenticated but not allowed (e.g. wrong role or account type). |
| `NOT_FOUND` | 404 | Resource not found (user, ride, order, etc.). |
| `CONFLICT` | 409 | Conflict with current state (e.g. duplicate, already completed). |
| `INTERNAL_ERROR` | 500 | Server error. Use `meta.requestId` for support. |

Nest/Express may also return `error` as the HTTP status text (e.g. `Bad Request`, `Unauthorized`) when no explicit code is set; treat those as the semantic equivalent of the codes above based on status.

### Authentication

- **Bearer JWT:** Most endpoints require `Authorization: Bearer <token>`.
- **Public:** Login, send/verify OTP, set/verify PIN, admin login (see Swagger “Pay Auth”).
- **Admin:** Endpoints under `admin/*` require JWT with role `ADMIN`.

Use Swagger “Authorize” with your JWT to call protected endpoints.

**Admin dashboard (test account):**  
`POST /api/v1/auth/admin/login` with body `{ "email": "admin@nexapay.com", "password": "admin123" }`.  
Email is case-insensitive. If no admin user exists, one is created automatically.

---

## Example flows

### Nexa Pay: OTP → profile → KYC → admin approve → wallet

1. **Send OTP:** `POST /api/v1/auth/send-otp` or `POST /api/v1/pay/auth/send-otp`  
   Body: `{ "phone_number": "+212612345678" }`
2. **Verify OTP:** `POST /api/v1/auth/verify-otp`  
   Body: `{ "phone_number": "+212612345678", "otp": "123456" }`  
   Response includes `otp_session_token` and `accounts`.
3. **Set PIN (first time):** `POST /api/v1/auth/pin/set`  
   Body: `{ "otp_session_token": "<from step 2>", "pin": "1234" }`
4. **Verify PIN (login):** `POST /api/v1/auth/verify-pin`  
   Body: `{ "phone_number": "+212612345678", "pin": "1234", "account_type": "CONSUMER" }`  
   Response includes `access_token`. Use it as Bearer for next steps.
5. **Profile:** `GET /api/v1/users/me`, `PATCH /api/v1/users/profile`
6. **KYC submit:** `POST /api/v1/kyc/submit` with required KYC fields.
7. **KYC document/selfie:** `POST /api/v1/kyc/upload/document`, `POST /api/v1/kyc/upload/selfie` (multipart).
8. **Admin approve KYC:** `POST /api/v1/admin/kyc/:userId/approve` (admin JWT).
9. **Wallet:** After KYC approval, use `GET /api/v1/wallets/me`, `GET /api/v1/wallets/balance`, `POST /api/v1/wallets/topup`, etc.

### Nexa Go: create ride → driver accept → status updates

1. **Create ride (consumer):** `POST /api/v1/go/rides`  
   Body: e.g. `{ "pickup_lat": 33.5, "pickup_lon": -7.6, "dropoff_lat": 33.6, "dropoff_lon": -7.5, "vehicle_type": "CAR" }`  
   Use consumer JWT.
2. **List rides:** `GET /api/v1/go/rides` (optional `?status=REQUESTED`).
3. **Driver accept:** `PATCH /api/v1/go/rides/:id/accept` with driver JWT.
4. **Driver arrive / start / complete:**  
   `PATCH /api/v1/go/rides/:id/arrive`, `.../start`, `.../complete` with driver JWT.

### Nexa Go: delivery order flow

1. **List merchants/restaurants:** `GET /api/v1/go/delivery/merchants`, `GET /api/v1/go/delivery/restaurants`
2. **Create order:** `POST /api/v1/go/delivery/orders` with order payload (see Swagger “Go Deliveries”).
3. **Merchant:** `POST /api/v1/go/delivery/orders/:id/prepare`, `.../ready`
4. **Courier:** `POST /api/v1/go/delivery/orders/:id/accept`, `.../pickup`, `.../deliver`

---

## Project layout

- `src/common/` — Config, database, guards, filters, interceptors, pipes, decorators, middleware, logger
- `src/domains/pay/` — Pay domain (auth, users, wallets, ledger, transactions, KYC, admin, QR, NFC)
- `src/domains/go/` — Go domain (aggregates taxi + delivery)
- `src/modules/` — Feature modules by service:
  - Pay: `auth`, `users`, `wallets`, `compliance`, `admin`, etc.
  - Go Taxi: `go-taxi/` (rides, drivers, matching, commissions, pricing)
  - Go Delivery: `go-delivery/` (merchants, orders, couriers, restaurants)
- `database/migrations/` — SQL migrations (additive only)
- `docs/API_MODULES_MAP.md` — API and modules map
- Root `STRUCTURE.md` — Full structure guide for adding new services

---

## Scripts

- `npm run start` / `npm run start:dev` — Run API
- `npm run build` — Build for production
- `npm run lint` — ESLint
- `npm run format` — Prettier
- `npm run seed:taxi` / `npm run seed:food` — Seed test data (see package.json)
- `npm run test` / `npm run test:e2e` — Tests

---

## CI/CD (GitHub Actions)

Root workflows:

- `.github/workflows/ci.yml`
  - Backend: install, lint/format, unit tests with coverage, build
  - Flutter app: format/analyze/tests + Android APK build
- `.github/workflows/staging-deploy-placeholder.yml`
  - Safe placeholder for staging deployments

Backend commands used by CI:

- `npm ci`
- `npm run lint` *(non-blocking in CI for now)*
- `npm run format` *(non-blocking in CI for now)*
- `npm run test -- --coverage --passWithNoTests --runInBand`
- `npm run build`

Coverage output:

- `coverage/` (Jest LCOV + summary)

### Secrets and Environment Safety

- Never commit secrets (`.env`, service accounts, SSH keys, API tokens).
- Configure environment values through GitHub repository/environment secrets.
- Prefer staging/prod scoped secrets via GitHub Environments (`staging`, `production`).
- Keep `.env.example` values non-sensitive placeholders only.

---

## Swagger

Open **`http://localhost:3000/api/v1/docs`** after starting the server. Use “Authorize” to set a Bearer token. Tags group endpoints by domain (Pay Auth, Pay Users, Pay KYC, Pay Admin, Pay Wallets, Pay Transactions, Pay QR/NFC, Go Rides, Go Drivers, Go Deliveries).
