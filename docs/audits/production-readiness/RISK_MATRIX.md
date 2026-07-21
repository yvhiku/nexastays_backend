# Risk Matrix

| Risk | Probability | Impact | Mitigation | Status |
|------|-------------|--------|------------|--------|
| Duplicate payment webhook | Medium | Critical | Lock intent in TX + unique constraint | Open P0 |
| Cron duplicate registration | High | High | Single ScheduleModule.forRoot | Open P0 |
| Identity unguarded new route | Medium | Critical | Global JwtAuthGuard | Open P0 |
| axios CVE on web client | High | High | Bump to 1.18.1 | Open P0 |
| notifications multer CVE | Medium | High | Pin 2.2.0 override | Open P0 |
| Event loss (no Redis, wrong URL) | Low | High | Fixed URL; require REDIS_URL in prod | Partial |
| API contract drift | Medium | Medium | Client shims; add contract tests | Partial |
| Signed media URL leak | Low | Medium | Short TTL; rotate secrets | Accepted |
| Snapshot stale KYC | Medium | Medium | Lower TTL or event invalidation | Open P1 |
| Admin ops DB overload | Low | Medium | Cache dashboard aggregates | Open P2 |
| Legacy code accidental rewire | Low | High | Quarantine legacy/ | Open P2 |
| Next.js 14 advisories | Medium | High | Plan Next 15 migration | Open P1 |
