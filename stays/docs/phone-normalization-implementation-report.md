# Phone Normalization Layer – Implementation Report

## Overview

A consistent E.164 phone normalization layer was added across the backend to ensure:

- All phone numbers are stored and compared in E.164 format
- Duplicate records from formatting differences (e.g. `0612345678` vs `+212612345678`) are prevented
- Morocco formats (06..., 61234..., 212..., +212...) and international E.164 numbers are supported

---

## Affected Files and Logic Paths

### Core Utility

| File | Role |
|------|------|
| `src/common/phone/phone-normalizer.ts` | Central normalizer: `normalizePhoneNumber`, `normalizePhoneOrThrow`, `tryNormalizePhoneNumber`, `validatePhoneNumber` |
| `src/common/phone/phone-normalizer.spec.ts` | Unit tests for Morocco and international formats, validation, edge cases |

### Auth Module

| File | Logic Path | Change |
|------|------------|--------|
| `src/modules/auth/auth.controller.ts` | `login`, `sendOtp`, `sendOtpV2`, `verifyOtp`, `verifyOtpV2`, `verifyPin`, `verifyPinV2` | Normalize `phone_number` via `normalizePhoneOrThrow` before calling service |
| `src/modules/auth/auth.service.ts` | `sendOtp` | Store OTP with normalized phone in `otp_codes` |
| `src/modules/auth/auth.service.ts` | `verifyOtp` | Lookup OTP by normalized phone |
| `src/modules/auth/auth.service.ts` | `findUserByPhone`, `findConsumerByPhone`, `findAccountsByPhone` | Normalize input, fallback to raw for legacy |
| `src/modules/auth/auth.service.ts` | `verifyPin` | Normalize phone before account lookup |

### Users Module

| File | Logic Path | Change |
|------|------------|--------|
| `src/modules/users/users.service.ts` | `createUser` (consumer) | Normalize phone, store normalized, check both normalized and raw for duplicates |
| `src/modules/users/users.service.ts` | `findForKyc`, `findOrCreateForKyc` | Normalize before lookup, fallback to raw for legacy |
| `src/modules/users/users.service.ts` | `createRoleAccount` | Normalize phone, store normalized |
| `src/modules/users/users.service.ts` | `getNexaProfileByPhone` | Fallback user lookup uses normalized and raw |
| `src/modules/users/users.service.ts` | `changePhone` | Normalize new phone; OTP lookup uses normalized and raw for current phone |

### Identity & Compliance

| File | Logic Path | Change |
|------|------------|--------|
| `src/modules/users/identity-phone-numbers.service.ts` | Identity phone storage | Uses `normalizePhoneNumber` / `tryNormalizePhoneNumber` for `normalized_phone_number` |
| `src/modules/compliance/compliance.service.ts` | `getStatus(phoneNumber)` | Normalize via `normalizePhoneOrThrow`, fallback to raw for legacy users |

### Registration Applications (Go-Taxi)

| File | Logic Path | Change |
|------|------------|--------|
| `src/modules/go-taxi/registration-applications/registration-applications.service.ts` | `submit` | Normalize phone before storing application |
| `src/modules/go-taxi/registration-applications/registration-applications.service.ts` | `approve` | Normalize before identity creation and role account creation |
| `src/modules/go-taxi/registration-applications/registration-applications.service.ts` | `getStatusByPhone` | Add normalized value to candidate list for lookup |

---

## Behaviour

- **Write path**: New and updated records store the **normalized** phone (E.164).
- **Read path**: Lookups first use normalized phone; if nothing is found, fallback to raw for legacy data.
- **Validation**: Invalid or ambiguous numbers (empty, too few digits, too many digits, ambiguous) are rejected via `validatePhoneNumber` / `normalizePhoneOrThrow`.

---

## Tests

- Morocco: `0612345678`, `612345678`, `212612345678`, `+212612345678`, with spaces/dashes
- International: `+12025551234`, `+33612345678`, `+447911123456` (pass-through)
- Validation: empty, too few/many digits, ambiguous values
- `tryNormalizePhoneNumber` returns `null` for invalid input
- `normalizePhoneOrThrow` throws `BadRequestException` for invalid input

---

## Secondary / Lower Priority

Phone numbers are also used in:

- Wallets controller – `phone_number` for consumer lookup via identity
- Drivers service – registration lookups with various formats
- Admin KYC service – `phone_number` search/filter
- Transactions – `receiver_phone_number`
- QR/NFC flows – `merchant_phone_number`

Normalization can be applied here if these flows require strict E.164 consistency and deduplication.
