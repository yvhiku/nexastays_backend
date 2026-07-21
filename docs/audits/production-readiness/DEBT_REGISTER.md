# Technical Debt Register

Master list of audit findings. Updated 2026-07-21.

| ID | Class | Severity | Area | Finding | Phase |
|----|-------|----------|------|---------|-------|
| P0-001 | Launch blocker | Critical | TX | Duplicate payment webhook processing | 4 |
| P0-002 | Launch blocker | Critical | Config | Localhost fallbacks in CMI/media URLs in prod | 3,10 |
| P0-003 | Launch blocker | Critical | Config | Dev signing secrets if env unset in prod | 3,12 |
| P0-004 | Launch blocker | High | ARCH | Duplicate ScheduleModule.forRoot() | 1,4 |
| P0-005 | Launch blocker | High | DB | No unique booking idempotency_key index | 2 |
| P0-006 | Launch blocker | High | DB | Multiple payment intents per booking | 2,4 |
| P0-007 | Launch blocker | High | TX | Payment expiry vs webhook race | 4,5 |
| P0-008 | Launch blocker | High | SEC | Identity opt-in JWT (no global guard) | 3 |
| P0-009 | Launch blocker | High | DEP | nexastays_web axios 1.13.6 CVEs | 0 |
| P0-010 | Launch blocker | High | DEP | notifications-service multer 2.1.1 + no CI | 0,11 |
| P0-011 | Launch blocker | High | OPS | notifications-service not in CI pipeline | 11 |
| P0-012 | Launch blocker | High | Config | Require REDIS_URL / NOTIFICATIONS_SERVICE_URL in prod | 8,10 |
| P1-001 | Technical debt | High | SEC | Session JWT on snapshots/me without OtpSessionResolver | 3 |
| P1-002 | Technical debt | High | ARCH | StaysService / AdminStaysService god objects | 1 |
| P1-003 | Technical debt | Medium | API | Host verification status field shim | 6.5 |
| P1-004 | Technical debt | Medium | Events | Identity swallows domain event failures | 8 |
| P1-005 | Technical debt | Medium | Events | MUTE notification level not enforced | 5 |
| P1-006 | Technical debt | Medium | Perf | In-memory rate limit not shared | 4,7 |
| P1-007 | Technical debt | Medium | Perf | Admin ops overview query storm | 1,7 |
| P1-008 | Technical debt | Medium | DEP | identity typeorm 0.3.28 | 0 |
| P1-009 | Technical debt | Medium | Test | Zero admin controller specs | 11 |
| P1-010 | Technical debt | Medium | OPS | Lifecycle cron no distributed lock | 12 |
| P2-001 | Enhancement | Low | API | OpenAPI incomplete | 6 |
| P2-002 | Enhancement | Low | API | Error envelope not uniform | 6 |
| P2-003 | Enhancement | Low | Events | BOOKING_HOST_APPROVED never published | 5,8 |
| P2-004 | Future architecture | Low | ARCH | Extract @nexa/common from duplicated libs | 1 |
| P2-005 | Future architecture | Low | ARCH | Delete identity legacy/ | 9 |

**Counts:** 12 P0 | 10 P1 | 5 P2+
