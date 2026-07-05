# Auth Refactor: Identity-First, Account Context Selection

## Target Model

1. **Identity auth:** Phone + OTP and/or PIN authenticates the human (UnifiedIdentity).
2. **Account context:** Backend returns available accounts; client selects one.
3. **Account-scoped JWT:** Token is bound to a single account; CONSUMER token cannot act as DRIVER.

## Current Problems

- `verifyOtp` auto-issues `access_token` for CONSUMER only when accounts exist.
- PIN flow requires `account_type` upfront; no identity-first flow.
- JWT payload lacks `unified_identity_id`, `session_id`, `auth_method`.
- Risk: multi-role users may get CONSUMER token and assume DRIVER authority elsewhere.

## JWT Claim Recommendations

### Account-scoped JWT (access_token)

| Claim | Type | Description |
|-------|------|-------------|
| sub | string | `account_id` (users.id) |
| unified_identity_id | string | Canonical identity |
| account_type | string | CONSUMER, DRIVER, COURIER, HOST, MERCHANT, ADMIN |
| session_id | string | Optional; for session revocation |
| auth_method | string | otp_pin, pin_only, otp_only |
| iat, exp | number | Standard JWT |

### Identity session token (post-OTP, pre-account selection)

| Claim | Type | Description |
|-------|------|-------------|
| sub | string | session_token (opaque) |
| type | string | `identity_session` |
| unified_identity_id | string | Resolved identity |
| phone_number | string | Verified phone |
| exp | number | Expiry (e.g. 120m) |

## Endpoint Flow

### 1. Consumer only

```
POST /auth/otp/send         { phone_number }
POST /auth/otp/verify       { phone_number, otp }
  → identity_session_token, accounts: [{ id, account_type }], nexa_profile

POST /auth/account/select   { identity_session_token, account_id }
  → access_token, refresh_token, expires_in

# Or PIN (returning user):
POST /auth/otp/send
POST /auth/otp/verify       → identity_session_token + accounts
POST /auth/pin/verify       { phone_number, pin, account_type: "CONSUMER" }
  → access_token, refresh_token
```

### 2. Consumer + Driver

```
POST /auth/otp/send
POST /auth/otp/verify       → identity_session_token, accounts: [CONSUMER, DRIVER]

# Client selects CONSUMER:
POST /auth/account/select   { identity_session_token, account_id: <consumer_id> }
  → access_token (CONSUMER-scoped)

# Client switches to DRIVER (new session):
POST /auth/pin/verify       { phone_number, pin, account_type: "DRIVER" }
  → access_token (DRIVER-scoped), refresh_token
```

### 3. Consumer + Host

```
POST /auth/otp/verify       → accounts: [CONSUMER, HOST]
POST /auth/account/select   { identity_session_token, account_id: <host_id> }
  → access_token (HOST-scoped)
```

### 4. Consumer + Courier

```
POST /auth/otp/verify       → accounts: [CONSUMER, COURIER]
POST /auth/account/select   { identity_session_token, account_id: <courier_id> }
  → access_token (COURIER-scoped)
```

## Safe Role-Switching Rules

1. **No silent promotion:** A CONSUMER token must not authorize DRIVER endpoints. `AccountTypeGuard` enforces this.
2. **Explicit selection:** Account switch requires re-auth (OTP or PIN) and new JWT.
3. **Refresh preserves context:** Refresh token is bound to `user_id` (account); refresh returns same account JWT.
4. **Identity session:** Short-lived; used only to select account and issue JWT.

## Backward Compatibility

- **verifyOtp:** When user has exactly one CONSUMER account, auto-issues `access_token` (same as before). When `account_id` is provided and valid, issues token for that account. Otherwise returns `identity_session_token` + `accounts`.
- **verifyPin:** Unchanged; takes `account_type`, returns account-scoped JWT.
- **Legacy clients:** Single-CONSUMER users get immediate `access_token` from `verifyOtp`. Multi-role users must call `account/select` or `verifyPin` with `account_type`.

## Endpoint Reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | /auth/otp/send | Send OTP to phone |
| POST | /auth/otp/verify | Verify OTP; returns identity_session_token + accounts |
| POST | /auth/account/select | Exchange identity session for account-scoped JWT |
| POST | /auth/pin/verify | Verify PIN; returns account-scoped JWT for selected account_type |
| POST | /auth/registration/complete | Exchange OTP session for CONSUMER JWT (post-KYC) |
| POST | /auth/refresh | Rotate tokens; preserves account context |
