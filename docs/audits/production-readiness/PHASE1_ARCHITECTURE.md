# Phase 1 — Architecture Audit

**Score: 8.2/10**

## Strengths

- Clear split: Identity (SSO/KYC) vs Stays (marketplace) vs platform notifications
- Stays uses global JWT + `@Public()` opt-out (secure by default)
- Messaging outbox + event-bus for side effects
- Security spec files exist (BOLA, financial integrity)

## Problems

| ID | Class | Severity | Finding | Files |
|----|-------|----------|---------|-------|
| ARCH-001 | Launch blocker | Critical | `ScheduleModule.forRoot()` in **both** `messaging.module.ts:44` and `stays.module.ts:44` + `app.module.ts` — duplicate cron registration | Duplicate outbox/lifecycle runs |
| ARCH-002 | Launch blocker | High | Circular `forwardRef` Stays ↔ Messaging ↔ Payments | `stays.module.ts`, `messaging.module.ts` |
| ARCH-003 | Technical debt | High | `StaysService` god object (1127 lines) | `stays.service.ts` |
| ARCH-004 | Technical debt | High | `AdminStaysService` duplicates media path logic | `admin-stays.service.ts:709-741` vs `stays.service.ts:156-193` |
| ARCH-005 | Technical debt | High | Identity **opt-in** JWT vs Stays global JWT | `identity/app.module.ts` vs `stays/app.module.ts` |
| ARCH-006 | Technical debt | Medium | ~306 legacy TS files in identity (not wired) — confusion risk | `identity/src/legacy/` |
| ARCH-007 | Technical debt | Medium | Duplicated `common/` (~130 files) between stays and identity | guards, idempotency, filters |
| ARCH-008 | Technical debt | Medium | Orphaned `FraudModule` not imported | `identity/modules/fraud` |
| ARCH-009 | Technical debt | Medium | Identity domain-events swallow transport failures | `identity/.../domain-events.service.ts` |
| ARCH-010 | Enhancement | Low | Empty `AuditController` shell | `audit.controller.ts` |

## Recommended refactors (post-launch)

1. Single `ScheduleModule.forRoot()` in AppModule only
2. Global JwtAuthGuard on Identity with `@Public()` exceptions
3. Extract shared `@nexa/common` package from duplicated guards/idempotency
4. Quarantine or delete `identity/src/legacy`
5. Event-only boundary between Stays and Messaging (reduce forwardRef)

See [OWNERSHIP_MAP.md](./OWNERSHIP_MAP.md), [SERVICE_COMPLEXITY.md](./SERVICE_COMPLEXITY.md).
