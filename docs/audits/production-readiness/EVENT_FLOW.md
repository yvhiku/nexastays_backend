# Event Flow Diagrams

## Payment confirmed → notifications

```mermaid
flowchart TD
  pay[StaysPaymentsService.handleWebhookSuccess]
  tx[DB Transaction]
  outbox[Outbox enqueue BOOKING_CONFIRMED PAYMENT_SUCCEEDED]
  worker[MessagingOutboxWorker every 5s]
  pub[DomainEventsService.publish]
  redis{REDIS_URL?}
  http[HttpFallback POST /api/v1/internal/events]
  consumer[EventsConsumerService]
  mapper[notification-mapper]
  orch[NotificationOrchestrator persist-first]
  inbox[(user_notifications)]
  fcm[FCM push optional]

  pay --> tx
  tx --> outbox
  outbox --> worker
  worker --> pub
  pub --> redis
  redis -->|Yes| consumer
  redis -->|No| http
  http --> consumer
  consumer --> mapper
  mapper --> orch
  orch --> inbox
  orch --> fcm
```

**Verify:** Publisher ✅ | Consumer ✅ | Retry outbox ✅ | Idempotency ⚠️ duplicate webhook | Logging ✅ | Metrics partial

## Message sent → notification

```mermaid
flowchart LR
  send[MessagesService.sendText]
  tx[Same DB TX]
  outbox[MESSAGE_RECEIVED outbox row]
  worker[OutboxWorker]
  bus[Event bus]
  ns[notifications-service]
  inbox[(user_notifications)]

  send --> tx
  tx --> outbox
  outbox --> worker
  worker --> bus
  bus --> ns
  ns --> inbox
```

**Verify:** Outbox in same TX as message ✅ | MUTE level not enforced ⚠️

## Identity KYC updated (gap)

```mermaid
flowchart LR
  kyc[AdminKycService]
  pub[DomainEventsService.publish]
  swallow[Errors swallowed]
  dead[No consumer for Stays refresh]

  kyc --> pub
  pub --> swallow
```

**Risk:** Stays snapshot stale until TTL — MEDIUM
