# R7 Notifications (085–086, 096–100) — under mock

**Freeze:** `STAYS_PAYMENT_PROVIDER=mock`, DEMO OTP, Sumsub sandbox, payouts off. Providers not flipped.

## Journey driven (dogfood HTTPS)

Evidence: `085-100-booking-journey.txt`, `085-100-postcheck.txt`, `085-100-gap-analysis.txt`

1. Guest OTP auth → `POST /stays/bookings` on LIVE listing `89563d40-…` → **201** `PAYMENT_PENDING` (`3a74502c-…` / `NST-2026-000004`)
2. `POST .../payments/intent` → **201** `provider=mock`
3. `POST .../payments/mock-confirm` → **200** `status=CONFIRMED`
4. `POST .../cancel` (`cancelled_by=guest`) → **200** `CANCELLED_BY_GUEST`

## Pipeline observations

| Layer | Observation |
|---|---|
| `stays_messaging_outbox` | `booking.confirmed.v1` + `payment.succeeded.v1` for this booking → **DONE** |
| Redis `nexa:events` | Also contains `booking.created.v1`, `booking.cancelled.v1` for this booking |
| `user_notifications` | **total = 0** before and after journey |
| Notifications consumer | Fresh DLQ for **this** journey: `booking.confirmed.v1` @ 14:31:53Z and `payment.succeeded.v1` @ 14:31:55Z |
| DLQ `lastError` | **`operator does not exist: text = uuid`** (consumerGroup `nexa-notifications:notifications-1`) |

## Exact delivery gap (do not flip providers)

`NotificationInboxService.create` dedupe predicate:

```sql
(n.event_id = :eventId OR n.data->>'event_id' = :eventId)
```

`n.event_id` is UUID; `n.data->>'event_id'` is text. Binding `:eventId` as uuid makes `text = uuid` illegal in Postgres → handler fails → retry → dead-letter. Code: `nexastays_platform/notifications-service/src/services/notification-inbox.service.ts` (~lines 39–42).

Events are published (outbox DONE + Redis stream) but **never land in `user_notifications`**. No SMS/email/provider change attempted.

## ID verdicts

| ID | Verdict | Why |
|---|---|---|
| 085 | **UNVERIFIED** | Mock booking confirmed; guest confirmation not in inbox (DLQ) |
| 086 | **UNVERIFIED** | Host new-booking notification not persisted (`user_notifications` empty) |
| 096 | **UNVERIFIED** | Booking confirmation notification delivery failed (DLQ `text = uuid`) |
| 097 | **UNVERIFIED** | Payment confirmation event DLQ’d; no recipient row |
| 098 | **UNVERIFIED** | Cancel event present on stream; inbox path still broken (same consumer bug); no inbox row |
| 099 | **UNVERIFIED** | Host booking notification not delivered |
| 100 | **UNVERIFIED** | Historical + ongoing consumer failures include `message.received.v1`; support/message not proven |
