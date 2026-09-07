# Nexa Stays — Release Hardening & Certification R3

**Report date:** 2026-09-07  
**Authoritative matrix:** original attachment checklist only ([CHECKLIST.md](../CHECKLIST.md)).  
**Do not mix** R1/R2 alternate IDs (their 005 ≠ lint; their READY ≠ this matrix).

**Scope:** local Identity/Stays/DB tooling. No deploy, DNS, or live provider activation.  
**Frozen (unchanged):** `STAYS_PAYMENT_PROVIDER=mock`, dogfood DEMO OTP allowed, `SUMSUB_MODE=sandbox`, host payouts off.

## Executive verdict

| Decision | Conclusion |
|---|---|
| Soft-launch certification | **NOT CERTIFIED.** Gates 1–3 complete including **047**; Gate 4 **local age encrypt/decrypt/restore PASS**, production **R2 retrieve still UNVERIFIED**. |
| Production readiness | **NOT READY / NOT CERTIFIED.** CMI, live Sumsub/SMS, payouts, VPS TLS/firewall, device, and R2 off-host recovery stay frozen/unverified. |
| Original matrix after R3 (+047/Gate4 local) | **48 PASS · 0 FAIL · 102 UNVERIFIED · 0 N/A = 150** |
| Baseline (pre-R3) | 38 PASS · 2 FAIL (005, 034) · 110 UNVERIFIED |

## Gate outcomes

| Gate | Goal | Outcome |
|---|---|---|
| Land repairs | KYC 067 + lint overrides + restore-failure | Landed (backend `19bbe07`, db `64aaf4a`); regressions retained |
| Gate 1 | FAIL **005** → PASS (eslint zero errors) | **PASS** — Identity + Stays `lint:check` exit 0 on certified Nest surface ([evidence/r3/005-lint/](../evidence/r3/005-lint/)) |
| Gate 2 | FAIL **034** → PASS (OTP expiry/consumed) | **PASS** — DEMO matches code only; always enforces expired/consumed/lockout ([evidence/r3/034-otp/](../evidence/r3/034-otp/)) |
| Gate 3 | P0 authz **041–048** | **041–048 PASS** — including consumer SUSPENDED via `AccountStatusGuard` ([evidence/r3/041-048-authz/](../evidence/r3/041-048-authz/)) |
| Gate 4 | Encrypted restore | **PARTIAL** — local age pipeline PASS (`restore-encrypted-local-drill.sh`); production `restore-r2-drill.sh` / R2 still UNVERIFIED ([evidence/r3/restore/](../evidence/r3/restore/)) |

## Matrix updates (original IDs only)

| ID | Before | After | Notes |
|---|---|---|---|
| 005 | FAIL | **PASS** | Certified surface 0 errors; warnings remain; Flutter analyzer out of backend gate |
| 034 | FAIL | **PASS** | Expired + consumed DEMO reject; production forbids DEMO |
| 036 | UNVERIFIED | UNVERIFIED | Notes updated: DEMO no longer skips expiry; attempt-limit matrix still incomplete |
| 041–046 | UNVERIFIED | **PASS** | Multi-actor HTTP + Jest; mutation-denied assertions |
| 047 | UNVERIFIED | **PASS** | `AccountStatusGuard` APP_GUARD Identity+Stays; RolesGuard also rejects SUSPENDED/FROZEN/BANNED |
| 048 | UNVERIFIED | **PASS** | Foreign UUID / query spoof contracts |
| 029–030 | PASS | PASS | Local plaintext disposable restore unchanged; **not** production R2 pipeline |

## Findings → remediation → retest

### F-R3-1 — Backend lint zero errors (005)

**Finding:** Active Nest surface previously had thousands of ESLint **errors**.  
**Remediation:** Certified surface ignores unwired legacy/specs/scripts; scoped prettier + targeted fixes; Nest `no-unsafe-*` etc. as **warnings**; `lint:check` non-mutating.  
**Retest:** Identity + Stays `npm run lint:check` exit 0. Evidence: `evidence/r3/005-lint/`.

### F-R3-2 — DEMO OTP skipped expiry/consumed (034)

**Finding:** `demoBypass` accepted DEMO code without `expires_at` / `consumed_at` checks.  
**Remediation:** DEMO substitutes only for hash/plain match on a live unexpired unconsumed OTP row; production cannot enable DEMO.  
**Retest:** Unit + dogfood HTTP. Evidence: `evidence/r3/034-otp/`.

### F-R3-3 — Authorization / BOLA (041–048)

**Finding:** Incomplete multi-actor ownership matrix; consumer SUSPENDED not gated on ordinary JWT routes.  
**Remediation:** BOLA matrix + `AccountStatusGuard` live Identity status on every authenticated request (Identity DB / Stays S2S authz). RolesGuard denies SUSPENDED/FROZEN/BANNED for staff.  
**Retest:** Jest AccountStatusGuard + RolesGuard + bola matrix ([047-jest.txt](../evidence/r3/041-048-authz/047-jest.txt)).

### F-R3-4 — Encrypted recovery (Gate 4)

**Finding:** Local 029/030 plaintext restore does not certify age encryption or R2 retrieve.  
**Remediation:** Quarantined obsolete `restore-drill.sh`; added `restore-encrypted-local-drill.sh` (age encrypt → verify → decrypt → isolated restore; app DBs unchanged). Production `restore-r2-drill.sh` still blocked (rclone, `/etc/nexa/backup.env`, R2 set, off-server key, sudo).  
**Retest:** [encrypted-local-drill.txt](../evidence/r3/restore/encrypted-local-drill.txt); R2 remains UNVERIFIED in [gate4-result.md](../evidence/r3/restore/gate4-result.md).

## Validation ledger (R3 delta)

| Check | Result |
|---|---|
| Identity + Stays `lint:check` | exit 0, 0 errors |
| OTP expiry/consumed unit + HTTP | PASS |
| BOLA / RolesGuard / AccountStatusGuard Jest | PASS (047 included) |
| `scripts/test-restore-failure.sh` | PASS |
| Local age encrypt→decrypt→restore drill | PASS (~4s RTO local) |
| Encrypted R2 retrieve (`restore-r2-drill.sh`) | **not executed** |

Frozen integration statement unchanged from original audit. No production deploy.

## Separation from R1/R2

| Artifact | Matrix | Role |
|---|---|---|
| This R3 report + original CHECKLIST | Attachment 001–150 | **Authoritative for soft-launch/hardening gates** |
| `reports/2026-09-07_150_CHECK_AUDIT*.md` | Alternate numbered checklist | Historical only; do not import IDs or READY claims into this matrix |

## Remaining soft-launch / production blockers (non-exhaustive)

1. Production Gate 4: `restore-r2-drill.sh` with R2 + off-server age key + alert proof  
2. Production-adjacent UNVERIFIED (CMI 075–084, SMS, Sumsub live, payouts, VPS, devices, CWV, etc.)  
3. OTP attempt-limit matrix **036** still UNVERIFIED  

## Commits / deploy

Backend and database tooling commits for this delta. **No deploy.**
