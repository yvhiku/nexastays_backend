# Nexa Stays — original 150-check audit and targeted repairs

**Report date:** 2026-09-07. Work and evidence collected 2026-09-06–07.  
**Scope:** six local repositories, disposable PostgreSQL 16/Redis, synthetic accounts and data. No production deployment, integration activation, DNS change or production database operation.

[Complete original 150-row checklist](CHECKLIST.md) · [Executed validation ledger](VALIDATION.md) · [Machine-readable evidence](evidence/matrix.json)

## R3 update (same day)

Hardening **R5** converted 7 more original UNVERIFIED→PASS (011, 019, 023, 065–067, 073); **022** stays UNVERIFIED. Current totals: **69 PASS · 0 FAIL · 81 UNVERIFIED**. R3 Gates 1–4 remain cleared; production **NOT READY**. See [R5 report](reports/2026-09-07_RELEASE_HARDENING_R5.md).

Hardening **R4** converted 14 original UNVERIFIED→PASS (auth 036/038, host 058/062, VPS infra subset). See [R4 report](reports/2026-09-07_RELEASE_HARDENING_R4.md).

Hardening round **R3** converted original **005** and **034** FAIL→PASS, **041–048** UNVERIFIED→PASS, and completed VPS encrypted R2 restore (Gate 4).

Authoritative R3 write-up: [reports/2026-09-07_RELEASE_HARDENING_R3.md](reports/2026-09-07_RELEASE_HARDENING_R3.md). Evidence: [evidence/r3/](evidence/r3/).

The sections below preserve the **pre-R3 baseline** narrative (38 PASS / 2 FAIL / 110 UNVERIFIED). Prefer the R5 report and updated CHECKLIST rows for current status.

## Executive verdict

| Decision | Conclusion |
|---|---|
| Local dogfood verification | **Substantial local verification completed; unconditional soft-launch readiness NOT CERTIFIED.** Booking/ledger integrity, signed KYC ordering/rollback, local backup/restore, builds and selected tests passed. Static validation and critical workflow coverage remain incomplete. |
| Real production readiness | **NOT READY / NOT CERTIFIED.** Live payments, production SMS/KYC, deployed infrastructure, actual devices, delivery, monitoring and operational recovery remain unestablished. |
| Original checklist totals (baseline, pre-R3) | **38 PASS · 2 FAIL · 110 UNVERIFIED · 0 N/A = 150** |
| Failed original requirements (baseline) | **005:** backend lint does not pass. **034:** expired/consumed DEMO OTP can still verify under the explicitly frozen dogfood behavior. |

Severity is recorded independently of result. A PASS is evidence for its stated local scope; it does not certify production by extrapolation. No percentage-based launch rule is used. Missing critical evidence prevents unconditional readiness even though final selected test executions report **1,219 passed, zero failed**. The default Stays run still skips ten opt-in PostgreSQL tests; those exact ten were separately executed successfully against a fully migrated disposable database.

### Historical and concurrent reports

The Sep 6 `LAUNCH_CERTIFICATION_SCORECARD.md` CONDITIONAL GO is historical. During this audit, backend HEAD advanced through `f4248a6` and `20613aa`, and platform HEAD advanced to `a12fcaa`. Those commits added another numbered checklist, R1/R2 reports and test coverage. Their numbering is **not the original attachment's requirements**: for example their 005 is an expiry scheduler check, whereas original 005 is lint. R2 also records lint debt within PASS and labels local dogfood READY. Those results cannot be substituted into this matrix.

All concurrent commits and reports were preserved. This report independently preserves the attachment's exact requirements and all IDs 001–150. Final Identity, Stays and notification suites were rerun after detecting the additional tests. This is a working-tree audit across changing repositories, **not an immutable release certification**; create and validate a coordinated release revision after review.

## Frozen integration statement

- Payments remain **`STAYS_PAYMENT_PROVIDER=mock`**. All successful payment, settled ledger and refund observations below are **simulated test state**, not real funds or CMI settlement. Original CMI checks 075–084 remain UNVERIFIED.
- **DEMO OTP remains enabled in dogfood.** Baseline audit recorded DEMO skipping expiry/consumed (**034 FAIL**). **R3** restores expiry/consumed enforcement while keeping DEMO code match for dogfood; see [R3 report](reports/2026-09-07_RELEASE_HARDENING_R3.md). Real production SMS was not exercised.
- **Sumsub sandbox remains the intended provider mode.** Actual provider network calls were disabled in the isolated runtime; signed local webhook simulations used a generated test secret. Actual sandbox SDK/applicant/reverification delivery remains UNVERIFIED, as does production KYC. No Sumsub tenant setting changed.
- Nine recorded dogfood/staging/production configuration-template SHA256 hashes remained identical: [verification](evidence/frozen-verification.json). No `.env` files were edited. Audit-only process overrides used generated credentials, test endpoints, reserved `.example` web origins and isolated ports. Existing service ports and architecture were preserved.

## Baseline and provenance

All six participating repositories were clean at the initial snapshot. Shared parent directory is not itself a Git repository. [Baseline](evidence/baseline.json) and [final working state](evidence/final-working-state.json) retain full revisions, dirty paths and frozen-template hashes without secret values.

| Repository | Initial revision | Final inspected HEAD |
|---|---|---|
| Backend (Identity/Stays) | `36d303ef5a0609da94159e6859ab69cad04c1d46` | `20613aa` — concurrent audit/test commits preserved |
| Web | `9fab15bf91710a5486a13e955842a482b59a1fbf` | unchanged |
| Dashboard | `e498a5cc677e358b5374b23b53556f2978edc3cf` | unchanged |
| Platform | `7724f98d245e748d50f2cfda3225894dfbb6e1f4` | `a12fcaa` — concurrent notification tests preserved |
| Database tooling | `802ba70adc4b331e1f2002b49862a858e15886d7` | unchanged |
| Flutter | `597852c30c7b9d89c1a7ee04880971f986bbe792` | unchanged |

Reviewed package/build/test/lint scripts, configuration and Compose references, migrations, backend controllers/services/DTOs, web/dashboard consumers, shared services and relevant Flutter auth/KYC consumers. No public API field was renamed or removed. Targeted API and UI regressions are described below; a complete API consumer compatibility certification was not performed.

## Findings and repairs

### F1 — Backend lint runner crashed before it could inspect source

**Root cause:** global overrides forced AJV 8 into ESLint dependencies expecting AJV 6, then brace-expansion 5 into minimatch versions expecting older compatible exports. Baseline lint crashed with dependency errors instead of producing useful diagnostics.

**Changed:** `identity/package.json`, `stays/package.json` and both lockfiles. Overrides now retain patched compatible majors: AJV 6 `^6.14.0`, AJV 8 `^8.18.0`; brace-expansion 1 `1.1.18`, 2 `2.1.4`, 5 `5.0.9`. Install used `--ignore-scripts --no-audit --no-fund`; no blanket dependency upgrade or formatter run.

**Retest:** both linters now execute; both backend builds and test suites pass, dependency audits report zero vulnerabilities. **Unresolved:** Identity 3,172 lint errors/338 warnings, Stays 2,696 errors/21 warnings. These include extensive formatting and unsafe-type findings. Restoring the lint runner did not resolve that debt or convert checklist 005 to PASS. Final counts include the newly added code and concurrent test changes; resolve scoped issues without disabling rules.

### F2 — KYC webhook acknowledgment, ordering and atomicity

**Root cause and reproduced impact:** processing failures could be acknowledged after a failed status write, preventing useful retries. A signed older PENDING webhook overwrote a newer REJECTED state in the local runtime. KYC and user state writes lacked a shared transactional boundary. A later full-entity dossier save could overwrite newer profile state.

**Changed:**

- `identity/src/modules/compliance/compliance.service.ts`: validate provider event timestamp, serialize per user with a transaction-scoped PostgreSQL advisory lock, apply KYC and user changes through transactional repositories, store the timestamp atomically, ignore duplicate/stale timestamps, and return a generic 503 on persistence failure.
- Dossier persistence now updates only its media/document fields and, for webhook calls, checks the expected event timestamp. Duplicate/stale events return before media sync.
- `identity/src/modules/compliance/entities/kyc-profile.entity.ts`: nullable `last_provider_event_at`.
- Database repo `identity/migrations/067_kyc_provider_event_order.sql`: deterministic additive column migration, applied only to the disposable Identity database.
- `compliance.service.spec.ts` and new `sumsub-webhook-auth.spec.ts`: retry/ordering/timestamp regressions and ten raw-body HMAC acceptance/rejection cases.

**Retest:** signed stale event ignored; exact replay acknowledged without reapplication; two concurrent events retain newest rejection. An injected PostgreSQL user-write failure returns 503 and leaves the earlier KYC status intact; retry succeeds after removing the synthetic trigger. Final Identity suite: 294 passed, 49 suites. [Executed DB/HTTP evidence](evidence/kyc-transaction-results.json), [before failure](evidence/kyc-order-http.log), [after repair](evidence/kyc-order-results.json).

**Contract/rollout implications:** identified provider events now require a valid `createdAtMs` or fallback `createdAt`; missing/invalid timestamps return 400. The affected caller is Sumsub webhook delivery and any internal replay tooling. Web/dashboard/mobile do not post this provider callback, and their response contracts remain unchanged. Apply migration 067 **before** starting the changed Identity service. The column is nullable and data-preserving; code rollback may retain it. No down migration/drop is needed.

**Limits:** equal timestamps are treated as duplicate/stale; distinct same-millisecond events and actual sandbox retry/reverification still require provider evidence. Full manual resync/provider dossier races are not certified. The transaction covers database state, not atomic external media delivery. Do not use local tests as production KYC signoff.

Provider documentation supports retry-aware acknowledgment and timestamp-aware ordering: [Sumsub webhook manager](https://docs.sumsub.com/docs/webhook-manager), [webhook logs](https://docs.sumsub.com/docs/webhook-logs), [verification results](https://docs.sumsub.com/docs/receive-verification-results).

### F3 — Restore script could continue after pg_restore exit 1

**Root cause:** `scripts/restore-postgres.sh` rejected only exit codes greater than 1. PostgreSQL restore can return 1 when errors occurred, so a partial restore could reach success validation.

**Changed:** database restore uses `--exit-on-error` and treats **every nonzero exit** as failure. New `scripts/test-restore-failure.sh` uses stub commands, asserts exit 1 is rejected and ensures validation does not continue. The regression never contacts a database.

**Retest:** shell regression passed. Separately executed native pg_dump/pg_restore on both disposable synthetic databases: final Identity dump 91,965 bytes, Stays 246,422 bytes; all 30/54 public-table content hashes match and extension versions match. Measured snapshot/restore/content-validation times were 2.61/4.07 seconds, **not a production RTO**.

**Unresolved:** the legacy `restore-drill.sh` still expects plaintext filesystem `.dump` files, whereas the current backup pipeline uses encrypted R2 artifacts. It also starts normal Compose services, so it was inspected and not run against the user's application databases. Native local restore does not certify the current R2 retrieval/decryption pipeline, failure alerts or operator recovery procedure. `restore-r2-drill.sh` needs its approved external configuration and a separate isolated target.

### F4 — Web standalone TypeScript check failed

**Root cause:** `lib/__tests__/sec-008-otp-binder-storage.test.ts` imported `../otp-session-store.ts`, incompatible with the current TypeScript import-extension settings (TS5097).

**Changed:** extensionless `../otp-session-store` import. No compiler suppression or auth storage change.

**Retest:** explicit `tsc --noEmit --incremental false`, web production build, lint and all 332 web tests pass.

### F5 — Narrow French header clipped the menu control

**Root cause:** the wordmark and controls exceeded the 390px layout; measured menu right edge was 403px.

**Changed:** `components/navbar/NavBar.tsx` hides the wordmark below 400px, preserving the logo and giving its link the accessible name “Nexa Stays.” Existing branding/components remain.

**Retest:** measured menu bounds became 338–382px at 390px, retaining a 44px button; visual inspection at 320px showed visible controls. Arabic 390px had `dir=rtl`, `lang=ar`, no document-width overflow; French selection reached an `fr`/LTR page. Builds, tsc, lint and tests pass. [Browser observations](evidence/browser-observations.md).

**Limits:** desktop viewport emulation is not native mobile verification. No complete checkout, keyboard or notch/device journey was executed. Screenshots were inspected inline but not archived.

## What the successful isolated workflows establish

Disposable PostgreSQL 16 instances used tmpfs data and generated credentials; Redis was isolated. The user's existing 5433/5434/6379 services were not the destructive test targets. Identity migrations: 41 initial plus new 067, 42 total; Stays: 59. Column-presence checks found no missing mapped columns, but did not prove full schema equality.

Real PG concurrency ran all ten cases, including exact and partial overlap races, 20 competing bookings with one winner, adjacent dates and distinct listings, rollback without orphan records, confirm/cancel and expire/confirm races, and completed-booking exclusion behavior. Financial probes additionally rejected duplicate settled guest payments and orphan payments and confirmed rollback.

The local mock HTTP journey created a booking for a preverified synthetic guest, returned the same booking for an idempotent retry, rejected another overlapping booking with 409, created/confirmed a mock intent twice, persisted exactly one simulated settled payment, cancelled/refunded and released dates for rebooking. Two nights at 100 produced subtotal 200, guest fee 10, host fee 10, paid amount 210 and payout amount 190. Refund fixture returned 210. These values are test assertions, not financial settlement evidence.

Auth HTTP checks exercised DEMO creation/verification, wrong-code rejection, cookie refresh/rotation, logout/revocation, anonymous/forged bearer rejection and valid-consumer admin rejection. The test send limit returned 429 on request 31. Production thresholds, access-token expiry across all transports, full BOLA/roles, suspended users and real SMS remain unverified.

## Remaining work, ranked

| Priority | Open issue / missing evidence | Exact next verification |
|---|---|---|
| P0 production gate | CMI sandbox/production deferred | After separate authorization and provider access, execute original 075–084, including authenticity, duplicate/late/failed callbacks and real refund/ledger reconciliation. Keep mock now. |
| P0 production gate | Real OTP and Sumsub unestablished | Keep DEMO/sandbox frozen; later prove generated-code expiry/attempt limits, delivery, actual sandbox applicant approval/reject/retry and production credentials in an authorized environment. |
| P0 local/release gate | Full role/ownership coverage absent | Use separate guest, hosts, admin/support and suspended fixtures; test each sensitive read/write route with foreign IDs and verify no changes on denial. Investigate consumer host-list GET policy without assuming a data leak. |
| P0 recovery gate | Encrypted off-host restore/alerts not exercised | Use isolated target and approved R2/age configuration; retrieve, decrypt, restore, compare contents/invariants, measure RPO/RTO and force backup failure to verify alert receipt. Repair/retire the obsolete drill through a reviewed tooling change. |
| P0 deployment gate | TLS, firewall, public DB/Redis exposure, routes/restarts not inspected live | Read effective release configuration and externally probe allowed/denied ports/routes; perform controlled staging restarts and recovery with operator evidence. Local PASSs do not clear this gate. |
| P0 security gate | No full upload/XSS/SQLi/log/error exposure assessment | Execute safe malicious fixture corpus across uploads, auth and every sensitive endpoint; check errors/logs for secret leakage and persisted side effects. Gitleaks and unit tests are partial evidence. |
| P1 code quality | 5,868 backend lint errors; 359 warnings; Flutter 128 analyzer issues | Make focused, reviewed fixes with affected suites; do not globally reformat or disable lint rules. |
| P1 product gate | Onboarding, moderation, support/admin UI and pagination unverified | Seed over 1,000 synthetic records; run complete roles and state transitions, pagination/filter/empty/error paths, closed-ticket denial, escalation preservation and report/ticket atomicity. |
| P1 delivery gate | Notification mapping passes, actual delivery does not have evidence | Trigger booking/payment/refund/message events to approved test recipients and verify acceptance, retries, deduplication and received content. |
| P1 UX gate | Physical devices/keyboard/safe areas untested | Run original 121–128 on named iOS/Android versions; retain screenshots/video and full checkout evidence. |
| P1 scale/SEO gate | Local sampled SEO only; no representative load/CWV budgets | Crawl real listing/landing routes and sitemap destinations; measure CWV and p95/p99 against defined budgets, representative isolated data and query plans. |
| P1 observability gate | No received alerts or assigned operational responders | Assign names/contacts/SLA in ops docs; trigger booking/payment/database/backup failures and prove on-call receipt and trace/recovery procedure. |
| P2 coverage/tooling | Telemetry zero tests; incomplete media/consumer runtime suites; obsolete restore drill | Add targeted behavioral coverage and an isolated supported drill. Passing build scripts cannot stand in for runtime evidence. |

Some work requires external configuration or devices and cannot be completed within the authorized local-only boundary. The current report provides the exact missing evidence; it does not request activation of frozen integrations.

## Evidence handling and completion boundaries

Evidence contains sanitized statuses, assertion names, commands, revisions, counts and selected logs. No private runtime environment, OTP/token values, cookies, generated database passwords, provider credentials, applicant dossiers or database dumps are included. Scanner candidates were triaged without copying matching secret-like values. The private scratch directory is not a deliverable or a release artifact.

No code was committed by this audit. Concurrent commits were preserved. The dashboard's generated `next-env.d.ts` route import change from its build was restored to the initial content; no dashboard product source change is retained. Clean-up outcomes are recorded in [cleanup evidence](evidence/cleanup.json).

**Acceptance reconciliation:** original IDs appear exactly once and requirements match the attachment; 150 result rows reconcile; every PASS names current executed or appropriate documentary evidence; ten PG concurrency tests and two restores were actually executed; deferred live integrations are UNVERIFIED, not N/A. Findings, fixes, retests, failed gates and verification limits remain traceable. The result is a completed local audit/report with explicit unresolved release requirements, not a production certification.
