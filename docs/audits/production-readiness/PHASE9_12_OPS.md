# Phases 9–12 — Dead Code, Config, Tests, CI/CD, Ops

## Phase 9 — Dead Code (Score: 7.0/10)

| Item | Action | Risk |
|------|--------|------|
| `identity/src/legacy/` (~306 files) | Quarantine / delete post-launch | High confusion if re-wired |
| `FraudModule` unused | Wire or remove | Low |
| Empty `AuditController` | Remove or implement | Low |
| openai, twilio, pdfkit in stays package.json | Remove | Safe |
| Duplicate stays logic in legacy | Never import | — |
| `push_device_tokens` stays DB table | Stop writes | Medium |

## Phase 10 — Configuration (Score: 8.5/10)

### Config drift

Compare: `backend/stays/.env.example`, `backend/identity/.env.example`, `platform/notifications-service/.env.example`, `docs/DEPLOYMENT.md`.

| Var | stays example | identity example | notifications example | Gap |
|-----|---------------|------------------|----------------------|-----|
| REDIS_URL | Yes | Yes | Yes | Must set in prod |
| NOTIFICATIONS_SERVICE_URL | Yes | — | — | stays only |
| INTERNAL_SERVICE_KEY | Yes | Yes | Yes | Must not use dev key in prod |
| FCM_* | — | partial | Yes | Optional for push |

### Infrastructure assumptions (localhost audit)

| File | Fallback |
|------|----------|
| cmi-payment.provider.ts:50-56 | 127.0.0.1:3002/3000 |
| messaging-media.service.ts:27 | 127.0.0.1:3002 |
| calendar-sync.service.ts:775 | 127.0.0.1:3002 |
| identity-*.client.ts | 127.0.0.1:3001 |
| event-bus index.ts | 127.0.0.1:3003 notifications |

**P0:** Fail fast in production if required URLs unset.

## Phase 11 — Testing + CI/CD (Score: 7.5/10)

### Test coverage matrix

| Domain | Unit | Integration | Security | Gap |
|--------|------|-------------|----------|-----|
| Messaging | 6 specs | partial | — | Attachments |
| Payments | CMI spec | partial | BOLA | Webhook race |
| Bookings | cancel, availability | — | BOLA listings | create+pay E2E |
| Identity auth | pin, refresh | — | — | OTP controller |
| Admin | **0** | — | — | **All admin** |
| Notifications | 2 | — | — | orchestrator |
| Event-bus | **0** | — | — | fallback URL |

### CI/CD (`.github/workflows/production-readiness.yml`)

| Step | stays | identity | web | notifications |
|------|-------|----------|-----|---------------|
| lint | ✅ | ✅ | ✅ | ❌ |
| build | ✅ | ✅ | ✅ | ❌ |
| test | ✅ | ✅ | ✅ | ❌ |
| npm audit | ✅ | ✅ | continue-on-error | ❌ |

## Phase 12 — Production Ops, Cron, Observability, Logging, Media, Startup

### Cron audit

| Job | Schedule | Overlap lock | Idempotent | Multi-instance |
|-----|----------|--------------|------------|----------------|
| Outbox worker | 5s | in-process flag | Yes | SKIP LOCKED ✅ |
| Booking lifecycle | hourly | **None** | Partial | **Risk** |
| Calendar sync | 1 min | — | — | **Risk** |
| Attachment cleanup | daily 2am | — | Yes | OK |
| Messaging lifecycle | daily 1am | — | Full table scan | Scale risk |

**P0:** Single ScheduleModule.forRoot; advisory lock on lifecycle cron.

### Observability

- Structured JSON logs: `@nexa/telemetry` in notifications — partial elsewhere
- traceId in HTTP middleware — verify stays/identity parity
- Metrics gated by X-Internal-Key in prod — OK

### Logging audit

**Should log:** bookingId, userId, requestId, conversationId, paymentId, eventId  
**Must NOT log:** JWT, PIN, OTP, refresh tokens, full card data

Audit: request logging middleware redacts `[REDACTED]` for requestId in terminals — verify no token logging in auth paths.

### Startup

- Nest bootstrap + TypeORM connect — standard
- Redis connect in event-bus — async, non-blocking
- Firebase init in notifications — optional
- **No expensive sync onModuleInit** blocking listen — OK

See [MEDIA_STORAGE_AUDIT.md](./MEDIA_STORAGE_AUDIT.md).
