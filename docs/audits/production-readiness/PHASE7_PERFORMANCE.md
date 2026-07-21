# Phase 7 — Performance, Cache, Memory

**Score: 8.3/10**

## Hot paths

| Path | Risk | Recommendation |
|------|------|----------------|
| Explore/search | Heavy EXISTS subqueries | Verify migration 017 indexes used |
| Admin ops overview | 30+ DB calls | Cache or materialized view (P2) |
| Conversation inbox | Unread sort + join | Index on last_message_at — present |
| Identity snapshot | HTTP per Stays request | TTL 120s (`IDENTITY_SNAPSHOT_TTL_MS`) — OK |
| Header /users/me/header | Parallel fetches | OK |

## Cache audit

| Cache | TTL | Invalidation | Risk |
|-------|-----|--------------|------|
| Identity snapshot (Stays) | 120s env | On profile change? | Stale KYC briefly |
| @nestjs/cache-manager | varies | Per-module | Document keys |
| Redis (event bus) | N/A | Stream retention | Buffer overflow drops events |

## Memory leak audit

| Pattern | Location | Status |
|---------|----------|--------|
| setInterval | ResilientEventPublisher flush 5s | **No clear on destroy** — LOW |
| @Cron | outbox 5s, lifecycle hourly, calendar 1min, attachment cleanup daily | Duplicate registration HIGH |
| Redis subscriber | EventsConsumerService | stop() on destroy — OK |
| In-memory Map | MessagingRateLimitService | Unbounded growth — MEDIUM |
| onModuleDestroy | notifications consumer | Partial — no Redis disconnect |

## N+1

- Explore: batch pin loading — indexed
- Admin funnel: single raw SQL — OK
