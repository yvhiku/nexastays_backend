# Remediation Execution Plan (Phase 15)

**Gate:** No Wave 1 code until this plan is reviewed and approved.

## Per-finding remediation table

| ID | Finding | Depends on | Effort | Risk if unchanged | Suggested PR |
|----|---------|------------|--------|-------------------|--------------|
| P0-004 | Duplicate ScheduleModule | — | S (1h) | Double crons | `fix/single-schedule-module` |
| P0-005 | Booking idempotency index | — | S (2h) | Duplicate bookings | `fix/booking-idempotency-unique` |
| P0-006 | Single intent per booking | P0-005 | M (4h) | Double charge | `fix/payment-intent-uniqueness` |
| P0-001 | Webhook intent lock | P0-006 | M (4h) | Double ledger | `fix/payment-webhook-idempotency` |
| P0-007 | Expiry vs webhook race | P0-001 | M (3h) | Wrong booking state | `fix/payment-expiry-guard` |
| P0-002 | CMI URL prod guard | — | S (1h) | Broken redirects | `fix/cmi-prod-urls` |
| P0-003 | Media secret prod guard | — | S (1h) | Forged media URLs | `fix/media-signing-prod` |
| P0-012 | Event bus prod env | — | S (2h) | Lost notifications | `fix/event-bus-prod-config` |
| P0-008 | Identity global JWT | — | M (6h) | Open endpoints | `fix/identity-global-jwt-guard` |
| P0-009 | Web axios bump | — | S (1h) | Client CVEs | `fix/web-axios-upgrade` |
| P0-010 | Notifications overrides | — | S (1h) | multer CVE | `fix/notifications-deps` |
| P0-011 | Notifications CI | P0-010 | S (2h) | Regressions ship | `fix/ci-notifications-service` |

**Estimated Wave 1 total:** ~28 engineer-hours (3–4 days)

---

## Wave 1 — P0 launch blockers (must complete before release)

1. **Cron + DB constraints** (P0-004, P0-005, P0-006) — no financial logic yet
2. **Payment integrity** (P0-001, P0-007) — with integration test
3. **Prod fail-fast config** (P0-002, P0-003, P0-012) — env validation module
4. **Identity security** (P0-008) — audit all @Public() routes
5. **Supply chain + CI** (P0-009, P0-010, P0-011)

**Exit criteria:** GO_NO_GO all domains green except optional WARN items; staging E2E booking flow.

---

## Wave 2 — High-risk P1 (reliability + security)

- P1-001 Session JWT route fixes
- P1-004 Identity event publish reliability
- P1-005 MUTE enforcement
- P1-006 Redis rate limits
- P1-008 typeorm bump
- P1-010 Lifecycle cron distributed lock
- P1-003 API contract tests (auth, booking, pay, message, notifications)

**Exit criteria:** No HIGH items in RISK_MATRIX open.

---

## Wave 3 — Performance + maintainability (pre/post launch sprint)

- P1-002 Service splits (StaysService, AdminStaysService)
- P1-007 Admin ops caching
- P1-009 Admin test suite
- P2 OpenAPI completion
- P2 Error envelope standardization

---

## Wave 4 — Enhancements (post-launch)

- P2-003 BOOKING_HOST_APPROVED event wiring
- P2-004 @nexa/common extraction
- P2-005 Legacy deletion
- Next.js 15 migration plan
- Virus scan hook for uploads

---

## PR rules

- One concern per PR where possible
- Never mix Wave 1 security with Wave 4 refactors
- Payment PRs require `financial-integrity.spec.ts` + new webhook race test
- Identity JWT PR requires route inventory diff in PR description
- API contract PRs pair backend + nexastays_web when shapes change

---

## Approval

| Role | Wave 1 approved | Date |
|------|-----------------|------|
| Engineering lead | ☐ | |
| Security review | ☐ | |

After Wave 1 merge: re-run audit Phases 3–4 spot-check and update GO_NO_GO.
