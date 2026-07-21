# Module Ownership Map

**Rule:** Each service owns its tables. Cross-service reads via HTTP/snapshot only. No cross-DB writes.

## Identity owns

| Data | Tables | API |
|------|--------|-----|
| Users, SSO | `users`, `unified_identities`, `identity_phone_numbers` | `/users`, `/auth`, `/snapshots/me` |
| Auth tokens | `refresh_tokens`, `otp_*`, `pin_attempts`, `trusted_devices` | `/auth/*` |
| KYC | `kyc_profiles`, tier policies, admin overrides | `/compliance/*` |
| Inbox (read) | `user_notifications` | `GET /users/me/notifications` |
| Push tokens (register) | `push_device_tokens` | `POST /users/me/push-token` |

**Must NOT write:** bookings, listings, messages, stays ledger.

## Stays owns

| Data | Tables | API |
|------|--------|-----|
| Bookings | `stays_bookings`, occupants, ref counters | `/stays/bookings/*` |
| Listings/hosts | listings, media, rate plans, host profiles | `/stays/*`, host routes |
| Payments | `stays_payment_intents`, `stays_ledger_entries` | `/stays/payments/*` |
| Messaging | `stays_conversations`, `stays_messages`, outbox | `/messaging/*` |
| Reviews | `stays_listing_reviews` | `/stays/reviews/*` |

**Must NOT write:** identity user rows, KYC profiles. Uses Identity user UUIDs without FK.

## Notifications-service owns (writes)

| Data | Table | Notes |
|------|-------|-------|
| Inbox inserts | `user_notifications` | Same DB as Identity — **shared table** |
| FCM dispatch | reads `push_device_tokens` | Identity registers tokens |

**Must NOT write:** booking status, conversation state.

## Event-bus owns

Transport only (Redis Streams / HTTP fallback). No business tables.

---

## Ownership leaks / risks

| ID | Severity | Finding |
|----|----------|---------|
| OWN-001 | Medium | `push_device_tokens` duplicated in stays DB (migration 010) and identity DB — canonical is **identity** |
| OWN-002 | Medium | notifications-service writes `user_notifications`; Identity reads — coordinated but shared blast radius |
| OWN-003 | Medium | Messaging module registers Stays entities directly (`StaysBooking`, `StaysListing`) — schema coupling |
| OWN-004 | Low | Stays stores guest/host user IDs only; KYC via snapshot API — **correct pattern** |
