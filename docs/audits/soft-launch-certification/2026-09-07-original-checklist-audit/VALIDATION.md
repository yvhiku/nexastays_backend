# Validation ledger — 2026-09-06 to 2026-09-07

93 recorded command executions: 75 exit zero, 18 nonzero. These are command outcomes across baseline, failed harness attempts and retests, not 150-check results. No unexecuted command is counted as PASS. Original metadata is in [command-ledger.json](evidence/command-ledger.json).

## R3 delta (2026-09-07)

| Activity | Outcome |
|---|---|
| Land KYC / lint overrides / restore-failure | Committed; regressions retained |
| Identity + Stays `npm run lint:check` (certified surface) | exit 0; 0 errors — [evidence/r3/005-lint/](evidence/r3/005-lint/) |
| OTP expiry/consumed unit + dogfood HTTP | PASS — [evidence/r3/034-otp/](evidence/r3/034-otp/) |
| BOLA / multi-actor authz Jest + HTTP | 041–048 PASS (047 AccountStatusGuard) — [evidence/r3/041-048-authz/](evidence/r3/041-048-authz/) |
| `scripts/test-restore-failure.sh` | PASS |
| Local `restore-encrypted-local-drill.sh` (age) | PASS — [evidence/r3/restore/encrypted-local-drill.txt](evidence/r3/restore/encrypted-local-drill.txt) |
| VPS `restore-r2-drill.sh` set `2026-09-07_02-15-51_srv1894430` | **PASS** — [evidence/r3/restore/r2-drill-vps.txt](evidence/r3/restore/r2-drill-vps.txt); alerts email+webhook success |

## R4 delta (2026-09-07)

| Activity | Outcome |
|---|---|
| 036 OTP attempt lockout HTTP + Jest | PASS — [evidence/r4/036-otp-attempts/](evidence/r4/036-otp-attempts/) |
| 038 refresh lifecycle HTTP + Jest | PASS — [evidence/r4/038-token-lifecycle/](evidence/r4/038-token-lifecycle/) |
| 058/062 host verification + upload reject | PASS — [evidence/r4/058-062-host-upload/](evidence/r4/058-062-host-upload/) |
| VPS infra/HTTPS/schema probes 012–021/024 | PASS subset — [evidence/r4/011-024-vps/](evidence/r4/011-024-vps/) |
| 065–067, 073 search/lock journeys | remain UNVERIFIED after R4 |
| Matrix after R4 | **62 PASS / 0 FAIL / 88 UNVERIFIED** — [R4 report](reports/2026-09-07_RELEASE_HARDENING_R4.md) |

## R5 delta (2026-09-07)

| Activity | Outcome |
|---|---|
| 011 env key-name completeness (dogfood) | PASS — [evidence/r5/011-019-infra/](evidence/r5/011-019-infra/) |
| 019 listen inventory (ufw sudo blocked) | PASS — same |
| 022 entity↔VPS schema equality | **UNVERIFIED** after R5; fixed in R6 |
| 023 FK + orphan probes | PASS — [evidence/r5/022-023-schema/](evidence/r5/022-023-schema/) |
| 065–067 seeded explore/filters/availability | PASS — [evidence/r5/065-073-search-booking/](evidence/r5/065-073-search-booking/) |
| 073 lock expire → rebook | PASS — Nest `expirePendingPayments` + HTTP |
| DB compose `restart: unless-stopped` | Aligned on VPS + repo — [evidence/r5/db-restart/](evidence/r5/db-restart/) |
| Matrix after R5 | **69 PASS / 0 FAIL / 81 UNVERIFIED** — [R5 report](reports/2026-09-07_RELEASE_HARDENING_R5.md) |

## R6 delta (2026-09-07)

| Activity | Outcome |
|---|---|
| 022 Identity/Stays schema migrations + compare | PASS — [evidence/r6/022-schema/](evidence/r6/022-schema/) |
| 057/059–061/063–064 host allow journey | PASS — [evidence/r6/host-allow/](evidence/r6/host-allow/) |
| 101–108 admin/support (107 after messaging report) | PASS — [evidence/r6/admin-support/](evidence/r6/admin-support/) |
| 129/131–134 live SEO | PASS — [evidence/r6/seo/](evidence/r6/seo/) |
| Matrix after R6 (pre R7) | **88 PASS / 0 FAIL / 62 UNVERIFIED** — [R6 report](reports/2026-09-07_RELEASE_HARDENING_R6.md) |

## R7–R9 delta (2026-09-07)

| Activity | Outcome |
|---|---|
| 111–119 live security probes | PASS — [evidence/r7/security/](evidence/r7/security/) |
| 085–086 / 096–100 mock notifications | PASS after inbox cast fix — [evidence/r7/notifications/](evidence/r7/notifications/) |
| 145/147/148 ops | PASS; 146/149 UNVERIFIED — [evidence/r7/ops/](evidence/r7/ops/) |
| 004/008/136–137/139–141/143 | PASS; 138/142 UNVERIFIED — [evidence/r8/](evidence/r8/) |
| 121–128 physical mobile | UNVERIFIED (no devices) — [evidence/r9/](evidence/r9/) |
| Matrix after R9 | **116 PASS / 0 FAIL / 34 UNVERIFIED** |

Full R3 narrative: [reports/2026-09-07_RELEASE_HARDENING_R3.md](reports/2026-09-07_RELEASE_HARDENING_R3.md).

## Final selected test executions

| Suite | Passed | Failed | Skipped | Scope |
|---|---:|---:|---:|---|
| Identity |294|0|0|Final working source, 49 suites; includes concurrent test additions|
| Stays |554|0|10|Default suite; PG tests opt in|
| Real PostgreSQL concurrency |10|0|0|All ten skipped default cases independently executed on full disposable schema|
| Web |332|0|0|Includes source-based tests, not 332 browser journeys|
| Dashboard |10|0|0|CSP/role unit tests|
| Notifications |8|0|0|Final mapper additions included; not recipient delivery|
| Flutter |11|0|0|Unit tests; no native build/device certification|
| Telemetry |0|0|0|Command exits zero, no tests discovered; coverage gap|
| **Selected executions** |**1219**|**0**|**10**|PG tests were separately executed, not silently unskipped in default suite|

Test names/statuses: [Identity](evidence/identity-assertions.json), [Stays](evidence/stays-assertions.json), [PG](evidence/postgres-concurrency-assertions.json). These totals exclude repeated runs and ad hoc HTTP assertions.

## Additional executed checks

- Mock booking HTTP journey: 11/11 assertions passed, including one simulated settled row after repeated confirmation, refund amount and inventory reuse.
- PG financial/constraint probes: 5/5 passed. Signed KYC rollback/retry/duplicate/concurrent probes: 4/4 passed; stale event pair: 2/2 passed after repair.
- Browser-like cookie lifecycle: 4/4 passed. Primed connection recovery: 2/2 passed. Native backup/restore: 2/2 databases passed, all public table contents and extensions matched.
- All participating TypeScript package production builds passed. Web build used explicit .example origins and mock provider; no environment files changed. Frontend tsc and locale checks passed.
- Dependency audit: ten package roots returned zero reported vulnerabilities; backend audits repeated after compatible override installation. This is time-bounded advisory evidence, not a security certification.
- Non-mutating ESLint: Identity 3172 errors/338 warnings; Stays 2696 errors/21 warnings. Web/dashboard lint pass. Flutter analyzer reports 128 issues and exits 1.
- Git diff --check: backend, web, database exit 0. No commits, deployment, DNS changes or production database tests performed by this audit.

## Baseline failure and harness reconciliation

1. Backend ESLint initially crashed due incompatible global AJV then brace-expansion overrides. Major-scoped patched versions restored execution; actual lint debt remains FAIL.
2. Web tsc TS5097 was a genuine import defect; extensionless import repaired it. Initial web production build refused localhost public origins as designed; explicit reserved .example audit origins allowed the build.
3. KYC stale event overwrote newer rejection before repair. Local signed HTTP replay now stays ordered. Original transient DB error acknowledgment was verified in the service regression; 503 plus atomic rollback is now exercised with an injected PG failure.
4. Initial browser cookie harness read the first Set-Cookie (an expired access cookie), missing the later refresh cookie. Multi-cookie parsing fixed the harness; no auth storage behavior was changed.
5. SQL-injection-shaped city input returned 400; initial generic HTTP harness expected 200 and called it FAIL. This is input rejection, not a confirmed defect or complete SQL injection assessment.
6. Consumer GET host listings returned 200. This is unresolved role-policy coverage, not proof of cross-account disclosure. No speculative role change made.
7. First booking fixture lacked a required BASIC KYC profile and received 400. Adding a synthetic preverified profile allowed the booking test; this does not certify KYC onboarding.
8. First Identity recovery probe terminated zero connections. Priming readiness first produced one real termination and successful reconnect. Initial FAIL was inadequate fault injection.
9. Initial Docker image pull timed out in credential helper. A private empty Docker CLI config against the same local daemon succeeded; no user credential configuration changed.
10. One current notification rerun used a nonexistent services/ path and failed to start; corrected repository path passed 8 tests. Initial schema metadata enumeration omitted auto-loaded entities; corrected active-module query passed column-presence checks.
11. Existing web dev lock prevented a second server in its directory. An isolated git archive snapshot with dependencies symlinked was used; the user's dev process was preserved.

## Recorded commands

Environment overrides containing generated credentials were intentionally not retained. Reproduction requires freshly generated disposable credentials and explicit isolated DB endpoints. Do not run destructive fixtures against existing databases.

| Run | Working directory (relative to workspace) | Actual command | Exit | Seconds |
|---|---|---|---:|---:|
| active-schema-columns-retest | nexastays_backend | node /tmp/nexa-cert-20260906/schema_check.cjs | 0 | 1.0 |
| active-schema-columns | nexastays_backend | node /tmp/nexa-cert-20260906/schema_check.cjs | 1 | 0.67 |
| backup-policy | nexastays_db | bash scripts/test-backup-policy.sh | 0 | 0.04 |
| browser-auth-http | nexastays_backend | python3 /tmp/nexa-cert-20260906/browser_auth_checks.py | 0 | 0.19 |
| consumers-build | nexastays_platform/consumers | npm run build | 0 | 0.45 |
| consumers-npm-audit | nexastays_platform/consumers | npm audit --json | 0 | 0.63 |
| dashboard-build | nexastays_dashboard | npm run build | 0 | 10.19 |
| dashboard-lint | nexastays_dashboard | npm run lint | 0 | 1.0 |
| dashboard-tests | nexastays_dashboard | npm run test:csp | 0 | 0.18 |
| dashboard-tsc | nexastays_dashboard | ./node_modules/.bin/tsc --noEmit --incremental false | 0 | 1.73 |
| event-bus-build | nexastays_platform/event-bus | npm run build | 0 | 0.51 |
| event-bus-npm-audit | nexastays_platform/event-bus | npm audit --json | 0 | 0.69 |
| gitleaks-image-retry | nexastays_backend | docker --config /tmp/nexa-cert-20260906/docker-config --host unix:///Users/apple/.docker/run/docker.sock pull ghcr.io/gitleaks/gitleaks:latest | 0 | 39.61 |
| gitleaks-image | nexastays_backend | docker pull ghcr.io/gitleaks/gitleaks:latest | 124 | 180.02 |
| http-runtime | nexastays_backend | python3 /tmp/nexa-cert-20260906/http_checks.py | 0 | 0.28 |
| identity-ajv-install | nexastays_backend/identity | npm install --ignore-scripts --no-audit --no-fund | 0 | 4.39 |
| identity-brace-install | nexastays_backend/identity | npm install --ignore-scripts --no-audit --no-fund | 0 | 1.11 |
| identity-build-order | nexastays_backend/identity | npm run build | 0 | 3.79 |
| identity-build-retest | nexastays_backend/identity | npm run build | 0 | 3.74 |
| identity-build | nexastays_backend/identity | npm run build | 0 | 4.11 |
| identity-final-audit | nexastays_backend/identity | npm audit --json | 0 | 0.99 |
| identity-final-build | nexastays_backend/identity | npm run build | 0 | 4.32 |
| identity-final-lint-report | nexastays_backend/identity | ./node_modules/.bin/eslint "{src,apps,libs,test}/**/*.ts" -f json -o /tmp/nexa-cert-20260906/identity-lint-results.json | 1 | 6.88 |
| identity-final-regression | nexastays_backend/identity | npm test -- --runInBand --json --outputFile=/tmp/nexa-cert-20260906/identity-final-jest.json | 0 | 3.11 |
| identity-final-tests | nexastays_backend/identity | npm test -- --runInBand --json --outputFile=/tmp/nexa-cert-20260906/identity-final-jest.json | 0 | 2.89 |
| identity-lint-final | nexastays_backend/identity | ./node_modules/.bin/eslint "{src,apps,libs,test}/**/*.ts" -f json -o /tmp/nexa-cert-20260906/identity-lint-results.json | 1 | 8.69 |
| identity-lint-retest | nexastays_backend/identity | ./node_modules/.bin/eslint "{src,apps,libs,test}/**/*.ts" -f json -o /tmp/nexa-cert-20260906/identity-lint-results.json | 2 | 0.19 |
| identity-lint | nexastays_backend/identity | ./node_modules/.bin/eslint "{src,apps,libs,test}/**/*.ts" | 2 | 0.13 |
| identity-migrations-order | nexastays_db | NEXA_DATABASE_COMPOSE=/tmp/nexa-cert-20260906/compose.yml sh identity/migrate.sh | 0 | 6.43 |
| identity-migrations | nexastays_db | NEXA_DATABASE_COMPOSE=/tmp/nexa-cert-20260906/compose.yml sh identity/migrate.sh | 0 | 122.58 |
| identity-npm-audit | nexastays_backend/identity | npm audit --json | 0 | 0.99 |
| identity-read-model-build | nexastays_platform/identity-read-model | npm run build | 0 | 0.4 |
| identity-read-model-npm-audit | nexastays_platform/identity-read-model | npm audit --json | 0 | 0.68 |
| identity-tests-retest | nexastays_backend/identity | npm test -- --runInBand --json --outputFile=/tmp/nexa-cert-20260906/identity-final-jest.json | 0 | 2.8 |
| identity-tests | nexastays_backend/identity | npm test -- --runInBand --json --outputFile=/tmp/nexa-cert-20260906/identity-jest.json | 0 | 4.39 |
| kyc-order-http-fixed | nexastays_backend | python3 /tmp/nexa-cert-20260906/kyc_order_checks.py | 0 | 0.13 |
| kyc-order-http-retest | nexastays_backend | python3 /tmp/nexa-cert-20260906/kyc_order_checks.py | 1 | 0.13 |
| kyc-order-http | nexastays_backend | python3 /tmp/nexa-cert-20260906/kyc_order_checks.py | 1 | 0.08 |
| kyc-order-unit-final | nexastays_backend/identity | npm test -- --runInBand --testPathPatterns="compliance.service\|sumsub-webhook-auth" | 0 | 1.14 |
| kyc-order-unit | nexastays_backend/identity | npm test -- --runInBand --testPathPatterns="compliance.service\|sumsub-webhook-auth" | 0 | 1.2 |
| kyc-transaction-http | nexastays_backend | python3 /tmp/nexa-cert-20260906/kyc_transaction_checks.py | 0 | 0.33 |
| local-backup-restore | nexastays_db | python3 /tmp/nexa-cert-20260906/restore_local.py | 0 | 6.29 |
| media-service-build | nexastays_platform/media-service | npm run build | 0 | 1.54 |
| media-service-npm-audit | nexastays_platform/media-service | npm audit --json | 0 | 0.69 |
| mobile-analyze | nexastays_mobile | flutter analyze --no-pub | 1 | 4.9 |
| mobile-tests | nexastays_mobile | flutter test | 0 | 8.84 |
| mock-booking-http-fixture | nexastays_backend | python3 /tmp/nexa-cert-20260906/booking_http_checks.py | 0 | 0.49 |
| mock-booking-http | nexastays_backend | python3 /tmp/nexa-cert-20260906/booking_http_checks.py | 1 | 0.33 |
| nexastays_backend-secret-history | nexastays_backend | docker run --rm --network none -v /Users/apple/nexa/nexastays/nexastays_backend:/repo:ro -v /tmp/nexa-cert-20260906/gitleaks:/evidence ghcr.io/gitleaks/gitleaks:latest git /repo --redact=100 --no-banner --report-format=json --report-path=/evidence/nexastays_backend.json --log-opts=--all --timeout=120 | 1 | 1.47 |
| nexastays_dashboard-npm-audit | nexastays_dashboard | npm audit --json | 0 | 0.65 |
| nexastays_dashboard-secret-history | nexastays_dashboard | docker run --rm --network none -v /Users/apple/nexa/nexastays/nexastays_dashboard:/repo:ro -v /tmp/nexa-cert-20260906/gitleaks:/evidence ghcr.io/gitleaks/gitleaks:latest git /repo --redact=100 --no-banner --report-format=json --report-path=/evidence/nexastays_dashboard.json --log-opts=--all --timeout=120 | 0 | 0.49 |
| nexastays_db-secret-history | nexastays_db | docker run --rm --network none -v /Users/apple/nexa/nexastays/nexastays_db:/repo:ro -v /tmp/nexa-cert-20260906/gitleaks:/evidence ghcr.io/gitleaks/gitleaks:latest git /repo --redact=100 --no-banner --report-format=json --report-path=/evidence/nexastays_db.json --log-opts=--all --timeout=120 | 0 | 0.48 |
| nexastays_mobile-secret-history | nexastays_mobile | docker run --rm --network none -v /Users/apple/nexa/nexastays/nexastays_mobile:/repo:ro -v /tmp/nexa-cert-20260906/gitleaks:/evidence ghcr.io/gitleaks/gitleaks:latest git /repo --redact=100 --no-banner --report-format=json --report-path=/evidence/nexastays_mobile.json --log-opts=--all --timeout=120 | 0 | 0.69 |
| nexastays_platform-secret-history | nexastays_platform | docker run --rm --network none -v /Users/apple/nexa/nexastays/nexastays_platform:/repo:ro -v /tmp/nexa-cert-20260906/gitleaks:/evidence ghcr.io/gitleaks/gitleaks:latest git /repo --redact=100 --no-banner --report-format=json --report-path=/evidence/nexastays_platform.json --log-opts=--all --timeout=120 | 0 | 0.44 |
| nexastays_web-npm-audit | nexastays_web | npm audit --json | 0 | 0.82 |
| nexastays_web-secret-history | nexastays_web | docker run --rm --network none -v /Users/apple/nexa/nexastays/nexastays_web:/repo:ro -v /tmp/nexa-cert-20260906/gitleaks:/evidence ghcr.io/gitleaks/gitleaks:latest git /repo --redact=100 --no-banner --report-format=json --report-path=/evidence/nexastays_web.json --log-opts=--all --timeout=120 | 1 | 1.66 |
| notifications-current-tests | nexastays_platform/notifications-service | npm test -- --runInBand | 0 | 1.78 |
| notifications-service-build | nexastays_platform/notifications-service | npm run build | 0 | 1.97 |
| notifications-service-npm-audit | nexastays_platform/notifications-service | npm audit --json | 0 | 0.79 |
| notifications-tests | nexastays_platform/notifications-service | npm test -- --runInBand | 0 | 1.81 |
| pg-concurrency-full-schema | nexastays_backend/stays | npm run test:pg-concurrency -- --json --outputFile=/tmp/nexa-cert-20260906/pg-jest.json | 0 | 0.91 |
| pg-integrity | nexastays_db | node /tmp/nexa-cert-20260906/pg-integrity.cjs | 0 | 0.13 |
| restore-failure-regression | nexastays_db | bash scripts/test-restore-failure.sh | 0 | 0.93 |
| restore-final-regression | nexastays_db | bash scripts/test-restore-failure.sh | 0 | 1.79 |
| stays-ajv-install | nexastays_backend/stays | npm install --ignore-scripts --no-audit --no-fund | 0 | 4.36 |
| stays-brace-install | nexastays_backend/stays | npm install --ignore-scripts --no-audit --no-fund | 0 | 1.1 |
| stays-build-retest | nexastays_backend/stays | npm run build | 0 | 4.18 |
| stays-build | nexastays_backend/stays | npm run build | 0 | 4.55 |
| stays-current-tests | nexastays_backend/stays | npm test -- --runInBand --json --outputFile=/tmp/nexa-cert-20260906/stays-current-jest.json | 0 | 4.43 |
| stays-final-audit | nexastays_backend/stays | npm audit --json | 0 | 0.88 |
| stays-final-lint-report | nexastays_backend/stays | ./node_modules/.bin/eslint "{src,apps,libs,test}/**/*.ts" -f json -o /tmp/nexa-cert-20260906/stays-lint-results.json | 1 | 5.92 |
| stays-lint-final | nexastays_backend/stays | ./node_modules/.bin/eslint "{src,apps,libs,test}/**/*.ts" -f json -o /tmp/nexa-cert-20260906/stays-lint-results.json | 1 | 7.19 |
| stays-lint-retest | nexastays_backend/stays | ./node_modules/.bin/eslint "{src,apps,libs,test}/**/*.ts" -f json -o /tmp/nexa-cert-20260906/stays-lint-results.json | 2 | 0.19 |
| stays-lint | nexastays_backend/stays | ./node_modules/.bin/eslint "{src,apps,libs,test}/**/*.ts" | 2 | 0.13 |
| stays-migrations | nexastays_db | NEXA_DATABASE_COMPOSE=/tmp/nexa-cert-20260906/compose.yml sh stays/migrate.sh | 0 | 127.38 |
| stays-npm-audit | nexastays_backend/stays | npm audit --json | 0 | 0.97 |
| stays-tests-retest | nexastays_backend/stays | npm test -- --runInBand | 0 | 4.12 |
| stays-tests | nexastays_backend/stays | npm test -- --runInBand --json --outputFile=/tmp/nexa-cert-20260906/stays-jest.json | 0 | 6.17 |
| telemetry-build | nexastays_platform/telemetry | npm run build | 0 | 0.39 |
| telemetry-npm-audit | nexastays_platform/telemetry | npm audit --json | 0 | 0.64 |
| telemetry-tests | nexastays_platform/telemetry | npm test | 0 | 0.13 |
| web-build-audit | nexastays_web | npm run build | 0 | 19.16 |
| web-build | nexastays_web | npm run build | 1 | 12.09 |
| web-final-build | nexastays_web | npm run build | 0 | 23.17 |
| web-final-lint | nexastays_web | npm run lint | 0 | 2.06 |
| web-final-tests | nexastays_web | npm test | 0 | 2.06 |
| web-final-tsc | nexastays_web | ./node_modules/.bin/tsc --noEmit --incremental false | 0 | 3.0 |
| web-lint-retest | nexastays_web | npm run lint | 0 | 1.91 |
| web-lint | nexastays_web | npm run lint | 0 | 2.03 |
| web-tests-retest | nexastays_web | npm test | 0 | 3.2 |
| web-tests | nexastays_web | npm test | 0 | 2.44 |
| web-tsc-retest | nexastays_web | ./node_modules/.bin/tsc --noEmit --incremental false | 0 | 4.15 |
| web-tsc | nexastays_web | ./node_modules/.bin/tsc --noEmit --incremental false | 2 | 3.35 |

## Additional direct operations (outside command wrapper)

- `python3 /tmp/nexa-cert-20260906/restore_final.py`: successful final snapshot/restore. It runs `docker exec <audit-db> pg_dump -U <synthetic-user> -d <synthetic-db> -Fc`, `createdb <separate-audit-restore-db>`, and `pg_restore --no-owner --no-acl --exit-on-error`. Every public-table ordered JSON-content MD5 and extension list compared equal. Generated dumps are private and excluded from this report.
- Inline Python/urllib HTTP probes: valid consumer authorization, OTP send burst, public web responses and primed DB recovery. Named result JSONs retain statuses and sanitized observations. Raw auth responses and cookie values are excluded.
- PG recovery query: `SELECT count(*) FROM (SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='<synthetic-db>' AND pid<>pg_backend_pid()) t`; scoped only to the disposable database after a readiness probe.
- Browser: read-only DOM bounds and viewport checks at 390px and 320px; details in browser-observations.md.
- Initial repository revisions/status and nine configuration SHA256 hashes recorded; final working state and unchanged hash results archived.

Private scratch paths identify where commands ran; they are not portable checked-in harnesses. Existing committed regression tests and migrations are durable. Some raw command logs are omitted to avoid retaining private runtime context; command status alone is not used as proof of an unobserved workflow.
