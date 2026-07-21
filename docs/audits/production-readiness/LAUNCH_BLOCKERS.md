# Launch Blockers — Master Backlog

**Last updated:** 2026-07-21

## P0 — Must fix before launch (12)

| ID | Finding | Files | Smallest fix | Depends on |
|----|---------|-------|--------------|------------|
| P0-001 | Duplicate payment webhook can double-confirm | `stays-payments.service.ts` | `SELECT … FOR UPDATE` on intent inside TX; idempotent ledger | — |
| P0-002 | CMI callback/redirect URLs default to localhost | `cmi-payment.provider.ts:50-56` | Throw if env missing when NODE_ENV=production | — |
| P0-003 | Media signing secret defaults to dev string | `messaging-media.service.ts:19,27` | Require env in prod; fail boot | — |
| P0-004 | Duplicate `ScheduleModule.forRoot()` | `messaging.module.ts:44`, `stays.module.ts:44` | Keep only in `app.module.ts` | — |
| P0-005 | No DB unique on booking idempotency_key | `stays-booking.entity.ts`, migration | Add partial unique index | — |
| P0-006 | Multiple payment intents per booking | `stays-payments.service.ts`, entity | Unique (booking_id) or idempotency upsert | P0-001 |
| P0-007 | Payment expiry cron races webhook | `booking-lifecycle-scheduler.service.ts` | Status guard + row lock on expire | P0-001 |
| P0-008 | Identity has no global JWT guard | `identity/app.module.ts` | APP_GUARD JwtAuthGuard + @Public() | — |
| P0-009 | Web axios 1.13.6 CVEs | `nexastays_web/package.json` | Bump to ^1.18.1 | — |
| P0-010 | notifications multer 2.1.1 CVE | `notifications-service/package.json` | overrides multer 2.2.0 | — |
| P0-011 | notifications-service not in CI | `.github/workflows/production-readiness.yml` | Add lint/build/test/audit job | — |
| P0-012 | Event bus localhost fallback in prod | `event-bus/src/index.ts`, env | Require REDIS_URL + NOTIFICATIONS_SERVICE_URL | — |

## P1 — Week 1 post-P0 (10)

| ID | Finding | Effort |
|----|---------|--------|
| P1-001 | Session JWT on snapshots/me | S |
| P1-002 | Split StaysService / AdminStaysService | L |
| P1-003 | Contract tests for top 5 API flows | M |
| P1-004 | Identity domain-events rethrow or outbox | M |
| P1-005 | Enforce conversation MUTE level | S |
| P1-006 | Redis-backed rate limiting | M |
| P1-007 | Admin ops query optimization | M |
| P1-008 | Bump identity typeorm to 0.3.30 | S |
| P1-009 | Admin controller spec suite | L |
| P1-010 | Distributed lock on lifecycle cron | M |

## P2 — Post-launch (sample)

- Uniform error envelope
- Complete OpenAPI decorators
- Publish BOOKING_HOST_APPROVED when feature ships
- Extract @nexa/common package
- Quarantine identity/legacy

## Fix order (dependencies)

```
P0-004 ScheduleModule (quick, prevents duplicate crons)
P0-005/P0-006 DB constraints
P0-001/P0-007 Payment locking (together)
P0-002/P0-003/P0-012 Prod env fail-fast
P0-008 Identity global JWT
P0-009/P0-010/P0-011 Dependencies + CI
```

## Score trend

| Phase | Score |
|-------|-------|
| Phase 0 Dependencies | 7.5 |
| Phase 1 Architecture | 8.2 |
| Phase 2 Database | 8.6 |
| Phase 3 Security | 8.0 |
| Phase 4 Transactions | 7.8 |
| **Overall** | **8.7** |
