# Phase 4 — Transactions + Concurrency

**Score: 7.8/10**

## Transaction map

| Operation | In TX? | Tables | Notes |
|-----------|--------|--------|-------|
| createBooking | ✅ | booking, availability, ref counter | Listing pessimistic lock — **good** |
| handleWebhookSuccess | ✅ | intent, booking, ledger, outbox enqueue | **Intent not locked in TX** — race |
| sendText message | ✅ | message, outbox, conversation | **Good** |
| provision conversation on pay | ✅ | conversation, outbox | **Good** |
| cancel booking | ✅ | booking, ledger | Events after commit |
| admin approveListing | ❌ | listing, audit | Partial failure possible |
| createOrGetIntent | ❌ | intent, booking status | Multi-step without TX |
| lifecycle scheduler updates | ❌ | booking per row | No row lock |

## Concurrency findings

| ID | Class | Severity | Finding |
|----|-------|----------|---------|
| TX-001 | Launch blocker | Critical | Duplicate CMI webhook can double-confirm payment |
| TX-002 | Launch blocker | High | Payment expiry cron races in-flight webhook |
| TX-003 | Launch blocker | High | Multiple payment intents per booking allowed |
| TX-004 | Launch blocker | High | Duplicate ScheduleModule → duplicate cron jobs |
| TX-005 | Technical debt | Medium | In-memory rate limit Map not shared across instances |
| TX-006 | Technical debt | Medium | MessagingRateLimitService Map never evicts keys |
| TX-007 | Technical debt | Medium | Outbox publish outside DB TX | OK if at-least-once + idempotent consumer |

## Positive

- `FOR UPDATE SKIP LOCKED` on outbox worker
- Booking create uses listing pessimistic write lock
- Payment re-checks availability under lock inside TX
