# Consumer Data Ownership

## Overview

Nexa Pay, Nexa Go (rider), and Nexa Stays (guest) all use the **same CONSUMER account** per person. One person = one UnifiedIdentity = one CONSUMER User. Wallet, rider functionality, and stays guest functionality attach to that single account.

---

## Shared Consumer Profile (UnifiedIdentity + User cache)

These fields are shared and apply across Pay, Go rider, and Stays guest:

| Field | Source | Sync |
|-------|--------|------|
| full_name | UnifiedIdentity (source); User (cache) | ProfileSyncService |
| email | UnifiedIdentity; User | ProfileSyncService |
| date_of_birth | UnifiedIdentity; User | ProfileSyncService |
| city | UnifiedIdentity; User | ProfileSyncService |
| address | UnifiedIdentity | - |
| profile_photo_url | UnifiedIdentity; User | ProfileSyncService |
| preferred_language | UnifiedIdentity | - |
| kyc_status / identity_verified | UnifiedIdentity; User | ReusableIdentityVerification, KycReuseService |
| linked_services | UnifiedIdentity | From attached Users |

---

## Shared Consumer Data (User)

| Data | Table | Purpose |
|------|-------|---------|
| phone_number | users | Auth, identity lookup |
| pin_hash | users | Auth |
| kyc_status | users | Cached from identity |
| wallet | wallets | Ledger, balance, top-up, transfers |

The wallet is the same for Pay, Go rider, and Stays guest.

---

## Nexa Pay Only

| Data | Table | Purpose |
|------|-------|---------|
| Ledger accounts / entries | ledger_accounts, ledger_entries | Balances, transactions |
| App transactions | app_transactions | P2P transfers (sender/receiver) |
| QR / NFC payment flows | - | Uses same wallet via user_id |

---

## Nexa Go Rider Only

| Data | Table | Purpose |
|------|-------|---------|
| Rides | go.rides | rider_user_id → CONSUMER |
| Ride pricing | go.ride_pricing | Per-ride pricing |
| Go transactions | go.go_transactions | Ride payment ledger link |
| Delivery orders (as customer) | go_delivery.orders | customer_id → CONSUMER |

All reference the same `User` (CONSUMER) via `rider_user_id` or `customer_id`.

---

## Nexa Stays Guest Only

| Data | Table | Purpose |
|------|-------|---------|
| Stays bookings | stays_bookings | guest_user_id → CONSUMER |
| Booking occupants | stays_booking_occupants | Per-booking |
| Stays payment intents | - | Uses same wallet |

All reference the same `User` (CONSUMER) via `guest_user_id`.

---

## Uniqueness Enforcement

- **One CONSUMER per `unified_identity_id`**: `uniq_consumer_per_unified_identity` unique index
- **One CONSUMER per phone**: `uniq_consumer_per_phone` unique index

See migration `026_one_consumer_per_identity.sql`.

---

## Migration Notes

1. **Run migration 026** after 024/025.
2. **Pre-check for duplicates** (if migration fails):
   ```sql
   SELECT phone_number, unified_identity_id, count(*)
   FROM users WHERE account_type = 'CONSUMER'
   GROUP BY phone_number, unified_identity_id HAVING count(*) > 1;
   ```
   Resolve duplicates before re-running migration.
3. **No application code changes required** for the constraint; createUser and findOrCreateForKyc already prevent duplicates by phone. The constraint is defense in depth.

---

## Auth and "me" Endpoints

- **JWT**: `sub` = User id, `account_type` = CONSUMER for Pay/Go rider/Stays guest
- **GET /users/me**: Returns the CONSUMER user; profile comes from UnifiedIdentity when linked
- **Wallet, rides, stays**: All resolve user from JWT `userId` (the CONSUMER id)

No separate consumer context per app; the same CONSUMER JWT works across Pay, Go, and Stays.
