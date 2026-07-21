# Phase 5 — Business Logic Audit

**Score: 8.4/10**

## Booking lifecycle

```
PENDING → (payment) → CONFIRMED → COMPLETED → (archived via cron)
         ↘ CANCELLED (guest/host rules)
```

| Transition | Enforced? | Gap |
|------------|-----------|-----|
| PENDING → CONFIRMED | Payment TX | Webhook race (see TX-001) |
| CONFIRMED → CANCELLED | Service rules | Cancel after complete? Verify |
| CONFIRMED → COMPLETED | Hourly cron | Double complete if cron overlaps |
| Payment → conversation | provisionWithinTransaction | **Good** — outbox enqueues notifications |

## Payment

- Mock provider for dev; CMI for prod with HMAC
- **BOOKING_CREATED** event published but **not consumed** for notifications (by design — notify on pay only)
- Ledger: GUEST_PAYMENT, PLATFORM_FEE, HOST_PAYOUT rows in same TX

## Messaging

- MESSAGE_RECEIVED outbox on send — **Good**
- Blocked/read-only conversations enforced in permissions service
- notification_level MUTED stored but **not enforced** at send time

## Reviews

- One review per booking — verify unique constraint in migration 013
- REVIEW_REPLY event mapped but **never published**

## Host onboarding

- KYC gate via Identity snapshot
- Draft → LIVE flow documented in LISTING_FLOW.md

## Notifications mapping gaps

| Event | Published? | Notification created? |
|-------|------------|----------------------|
| BOOKING_CONFIRMED | On payment | Yes |
| MESSAGE_RECEIVED | On send | Yes |
| BOOKING_HOST_APPROVED | No | No |
| REVIEW_REPLY | No | No |
| BOOKING_CREATED (pre-pay) | Yes | No |

## Unenforced transitions (verify in code)

- [ ] Cancel after COMPLETED
- [ ] Pay after CANCELLED
- [ ] Message on ARCHIVED conversation (read-only should block)
