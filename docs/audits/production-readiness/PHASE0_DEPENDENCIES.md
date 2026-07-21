# Phase 0 — Dependency Audit

**Score: 7.5/10**

## Dependency Health Summary

| Service | Prod deps | npm audit | CI | Overrides |
|---------|-----------|-----------|-----|-----------|
| backend/stays | Good | 3 vulns (mostly dev) | Yes | Strong |
| backend/identity | Good (typeorm lag) | ~27 vulns | Yes | Strong |
| notifications-service | **At risk** | 12 vulns (multer, uuid) | **No** | **None** |
| event-bus | Excellent | 0 | No | N/A |
| nexastays_web | **At risk** | 17 vulns (axios, next) | Partial (audit non-blocking) | None |

## Critical CVEs / version conflicts

| ID | Severity | Package | Repos | Fix |
|----|----------|---------|-------|-----|
| DEP-001 | **High** | axios 1.13.6 | nexastays_web direct | Bump to ^1.18.1 |
| DEP-002 | **High** | next 14.2.35 | nexastays_web | Plan Next 15+ migration |
| DEP-003 | **High** | multer 2.1.1 | notifications-service | Pin 2.2.0 override |
| DEP-004 | Moderate | typeorm 0.3.28 | identity lock | Bump to 0.3.30+ |
| DEP-005 | Moderate | uuid 9.0.1 | notifications (firebase chain) | Add override >=14.0.0 |

## Cross-repo version splits

- `@nestjs/cache-manager`: stays **2.0.0** vs identity **3.1.3**
- `uuid`: event-bus 11.x, notifications 9.x, backends 14.x
- `multer`: stays/identity 2.2.0 vs notifications 2.1.1

## Unused dependency candidates

| Package | Repo | Evidence |
|---------|------|----------|
| openai | stays, identity | No imports in src |
| twilio | stays | No usage in stays/src |
| pdfkit | stays | No usage in stays/src |

## CI gaps

- `platform/notifications-service` not in `.github/workflows/production-readiness.yml`
- `platform/event-bus` not in CI
- Web `npm audit` uses `continue-on-error: true`

## Upgrade recommendations

**P0:** axios web, notifications overrides, typeorm identity, add notifications to CI  
**P1:** Align cache-manager, remove dead deps, make web audit blocking  
**P2:** Standardize uuid, upgrade eslint on web
