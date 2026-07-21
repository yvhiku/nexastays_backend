# Phase 2 — Database + Repository Audit

**Score: 8.6/10**

## Stays DB highlights

| Area | Migrations | Status |
|------|------------|--------|
| Booking integrity | 016, 021 | CHECK constraints, booking_reference — **good** |
| Explore search | 017 | Dedicated indexes — verify query plans |
| Messaging/outbox | 022, 023 | Outbox + attachments — **good** |
| One host per identity | 007 | Unique constraint — **good** |

## Gaps

| ID | Severity | Finding | Recommendation |
|----|----------|---------|----------------|
| DB-001 | **Launch blocker** | No unique index on `stays_bookings.idempotency_key` | Add partial unique WHERE NOT NULL |
| DB-002 | **Launch blocker** | No unique constraint on payment intent per booking/idempotency | Add `(booking_id, idempotency_key)` or single intent rule |
| DB-003 | Medium | `push_device_tokens` in stays DB (010) duplicates identity | Mark stays copy deprecated; stop writing |
| DB-004 | Medium | No FK from stays user IDs to identity (by design) — orphan UUID risk | Document + periodic reconciliation job |
| DB-005 | Low | Heavy JSONB `reservation_snapshot` on conversations | OK for launch; monitor size |

## Repository audit

No dedicated repository layer — services use `@InjectRepository` + raw SQL.

| Location | Pattern | Risk |
|----------|---------|------|
| `outbox.worker.ts:81-92` | `FOR UPDATE SKIP LOCKED` | **Good** — multi-instance safe |
| `booking-reference.util.ts` | Parameterized INSERT ON CONFLICT | **Good** |
| `admin-stays.service.ts:233` | Raw funnel SQL | Low — maintainability |
| `conversations.service.ts:80` | EXISTS subquery in search | OK — ensure index on messages |

## N+1 risks

- `AdminStaysService.getOpsOverview()` — 30+ parallel queries (not N+1 but heavy)
- Conversation list with booking joins — verify single query vs per-row fetch
- Explore map pins — batch loading documented in migration 017

See [MIGRATION_SAFETY.md](./MIGRATION_SAFETY.md).
