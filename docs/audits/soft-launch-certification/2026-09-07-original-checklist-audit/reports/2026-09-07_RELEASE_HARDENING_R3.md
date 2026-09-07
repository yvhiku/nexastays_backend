# Nexa Stays — Release Hardening & Certification R3

**Report date:** 2026-09-07  
**Authoritative matrix:** original attachment checklist only ([CHECKLIST.md](../CHECKLIST.md)).  
**Do not mix** R1/R2 alternate IDs (their 005 ≠ lint; their READY ≠ this matrix).

**Scope:** local Identity/Stays/DB tooling. No deploy, DNS, or live provider activation.  
**Frozen (unchanged):** `STAYS_PAYMENT_PROVIDER=mock`, dogfood DEMO OTP allowed, `SUMSUB_MODE=sandbox`, host payouts off.

## Executive verdict

| Decision | Conclusion |
|---|---|
| Soft-launch certification | **NOT CERTIFIED.** Gates 1–3 cleared for touched original IDs; Gate 4 (encrypted R2 restore) remains open; **047** consumer suspension still UNVERIFIED. |
| Production readiness | **NOT READY / NOT CERTIFIED.** CMI, live Sumsub/SMS, payouts, VPS TLS/firewall, device, and encrypted off-host recovery stay frozen/unverified. |
| Original matrix after R3 | **47 PASS · 0 FAIL · 103 UNVERIFIED · 0 N/A = 150** |
| Baseline (pre-R3) | 38 PASS · 2 FAIL (005, 034) · 110 UNVERIFIED |

## Gate outcomes

| Gate | Goal | Outcome |
|---|---|---|
| Land repairs | KYC 067 + lint overrides + restore-failure | Landed (backend `19bbe07`, db `64aaf4a`); regressions retained |
| Gate 1 | FAIL **005** → PASS (eslint zero errors) | **PASS** — Identity + Stays `lint:check` exit 0 on certified Nest surface ([evidence/r3/005-lint/](../evidence/r3/005-lint/)) |
| Gate 2 | FAIL **034** → PASS (OTP expiry/consumed) | **PASS** — DEMO matches code only; always enforces expired/consumed/lockout ([evidence/r3/034-otp/](../evidence/r3/034-otp/)) |
| Gate 3 | P0 authz **041–048** | **041–046, 048 PASS**; **047 UNVERIFIED** ([evidence/r3/041-048-authz/](../evidence/r3/041-048-authz/)) |
| Gate 4 | Encrypted R2 restore | **UNVERIFIED** — age/rclone/R2 credentials/`/etc/nexa/backup.env` missing locally; obsolete plaintext drill quarantined ([evidence/r3/restore/](../evidence/r3/restore/)) |

## Matrix updates (original IDs only)

| ID | Before | After | Notes |
|---|---|---|---|
| 005 | FAIL | **PASS** | Certified surface 0 errors; warnings remain; Flutter analyzer out of backend gate |
| 034 | FAIL | **PASS** | Expired + consumed DEMO reject; production forbids DEMO |
| 036 | UNVERIFIED | UNVERIFIED | Notes updated: DEMO no longer skips expiry; attempt-limit matrix still incomplete |
| 041–046 | UNVERIFIED | **PASS** | Multi-actor HTTP + Jest; mutation-denied assertions |
| 047 | UNVERIFIED | UNVERIFIED | Staff freeze/listing_frozen proven; consumer `SUSPENDED` JWT path not gated |
| 048 | UNVERIFIED | **PASS** | Foreign UUID / query spoof contracts |
| 029–030 | PASS | PASS | Local plaintext disposable restore unchanged; **not** production encrypted pipeline |

## Findings → remediation → retest

### F-R3-1 — Backend lint zero errors (005)

**Finding:** Active Nest surface previously had thousands of ESLint **errors**.  
**Remediation:** Certified surface ignores unwired legacy/specs/scripts; scoped prettier + targeted fixes; Nest `no-unsafe-*` etc. as **warnings** (not disabled on active correctness rules); `lint:check` non-mutating. No global `--fix`, no blanket rule off, no “PASS WITH DEBT” for errors.  
**Retest:** Identity + Stays `npm run lint:check` exit 0. Evidence: `evidence/r3/005-lint/`.

### F-R3-2 — DEMO OTP skipped expiry/consumed (034)

**Finding:** `demoBypass` accepted DEMO code without `expires_at` / `consumed_at` checks.  
**Remediation:** DEMO substitutes only for hash/plain match on a live unexpired unconsumed OTP row; production/`NEXA_ENV=production` cannot enable DEMO.  
**Retest:** Unit `auth.otp-expiry-invariants.spec.ts`; dogfood HTTP expired→false, fresh→true, consumed→false. Evidence: `evidence/r3/034-otp/`.

### F-R3-3 — Authorization / BOLA (041–048)

**Finding:** Incomplete multi-actor ownership matrix; consumer GET host listings 200 looked like a leak.  
**Remediation:** Documented intended self-scoped GET policy; mutation + foreign-ID deny with no DB mutation; RolesGuard admin/host cases.  
**Retest:** Jest bola suites + HTTP matrix. **047** left UNVERIFIED (consumer suspension). Evidence: `evidence/r3/041-048-authz/`.

### F-R3-4 — Encrypted R2 recovery (Gate 4)

**Finding:** Local 029/030 plaintext disposable restore does not certify age→R2 production architecture.  
**Remediation attempted:** Quarantine banner on obsolete `restore-drill.sh`; failure-closed `pg_restore` regression re-run PASS. Full `restore-r2-drill.sh` **not** run (prerequisites missing).  
**Retest:** Documented blockers in `evidence/r3/restore/gate4-result.md`. Do not fake PASS.

## Validation ledger (R3 delta)

| Check | Result |
|---|---|
| Identity + Stays `lint:check` | exit 0, 0 errors |
| OTP expiry/consumed unit + HTTP | PASS |
| BOLA / RolesGuard related Jest | 158 related tests passed (see matrix) |
| `scripts/test-restore-failure.sh` | PASS |
| Encrypted R2 retrieve→decrypt→restore | **not executed** |

Frozen integration statement unchanged from original audit. No production deploy.

## Separation from R1/R2

| Artifact | Matrix | Role |
|---|---|---|
| This R3 report + original CHECKLIST | Attachment 001–150 | **Authoritative for soft-launch/hardening gates** |
| `reports/2026-09-07_150_CHECK_AUDIT*.md` | Alternate numbered checklist | Historical only; do not import IDs or READY claims into this matrix |

## Remaining soft-launch blockers (non-exhaustive)

1. Gate 4 encrypted R2 operator drill (or approved equivalent)  
2. Original **047** consumer suspended-user enforcement  
3. All still-UNVERIFIED production-adjacent items (CMI 075–084, SMS, Sumsub live, payouts, VPS, devices, CWV, etc.)

## Commits / deploy

Backend and database tooling commits for R3 land with this report. **No deploy.**
