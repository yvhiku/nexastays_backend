# Phase 8 — Events + External Services

**Score: 8.5/10** (improved after notifications URL fix)

See [EVENT_FLOW.md](./EVENT_FLOW.md) for diagrams.

## Event catalog

| Event | Published | Consumed | Notification |
|-------|-----------|----------|--------------|
| BOOKING_CONFIRMED | Payment TX | Yes | Guest + host |
| PAYMENT_SUCCEEDED | Payment TX | Yes | Guest payment |
| MESSAGE_RECEIVED | Message TX | Yes | Recipient |
| BOOKING_CANCELLED | Cancel | Yes | Guest + host |
| REVIEW_CREATED | Review submit | Yes | Host |
| REVIEW_REMINDER | Cron | Yes | Guest |
| BOOKING_CREATED | Booking create | No | No |
| BOOKING_HOST_APPROVED | Never | Mapped only | No |
| REVIEW_REPLY | Never | Mapped only | No |

## Pipeline checks

| Check | Status |
|-------|--------|
| Publisher validation (Zod) | Yes — event-bus |
| HTTP fallback URL | Fixed `/api/v1/internal/events` |
| Stays rethrows publish failure | Yes — outbox retries |
| Identity swallows publish failure | **No** — silent loss |
| Idempotent notification insert | Verify duplicate event handling |
| DLQ | event-bus retry queue |
| FCM silent no-op without creds | Yes |

## External services matrix

| Service | Client | Timeout | Retry | Circuit breaker | Idempotency |
|---------|--------|---------|-------|-----------------|-------------|
| Identity snapshot | identity-snapshot.client.ts | Configurable? | Partial | No | N/A |
| Identity profile photo | identity-profile-photo.client.ts | — | — | — | — |
| CMI payments | cmi-payment.provider.ts | — | Webhook verify | — | **Gap** TX-001 |
| Redis event bus | @nexa/event-bus | reconnect | Buffer 1000 | Yes | event id |
| Notifications HTTP | fallback-event-bus.ts | 2 attempts | Yes | — | — |
| FCM | fcm-push.service.ts | — | — | — | — |

**P0:** Require REDIS_URL + NOTIFICATIONS_SERVICE_URL in prod (no localhost default).
