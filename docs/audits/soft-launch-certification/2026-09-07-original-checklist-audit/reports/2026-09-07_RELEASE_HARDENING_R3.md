# Nexa Stays — Release Hardening & Certification R3

**Report date:** 2026-09-07  
**Authoritative matrix:** original attachment checklist only ([CHECKLIST.md](../CHECKLIST.md)).  
**Do not mix** R1/R2 alternate IDs (their 005 ≠ lint; their READY ≠ this matrix).

**Scope:** local Identity/Stays/DB tooling + VPS encrypted restore drill. No live CMI/Sumsub/SMS/payout activation.  
**Frozen (unchanged):** `STAYS_PAYMENT_PROVIDER=mock`, dogfood DEMO OTP allowed, `SUMSUB_MODE=sandbox`, host payouts off.

## Executive verdict

| Decision | Conclusion |
|---|---|
| R3 hardening Gates 1–4 | **CLEARED** (005, 034, 041–048 including 047, encrypted R2 restore drill). |
| Soft-launch overall matrix | **Still incomplete** — many original IDs remain UNVERIFIED (CMI, live SMS/Sumsub UX, VPS TLS/firewall rows, devices, etc.). Do not treat Gates 1–4 alone as 150/150. |
| Production readiness | **NOT READY / NOT CERTIFIED.** Live payments, production SMS/KYC, payouts, full infra/device certification remain open. |
| Original matrix after R3 | **48 PASS · 0 FAIL · 102 UNVERIFIED · 0 N/A = 150** |
| Baseline (pre-R3) | 38 PASS · 2 FAIL (005, 034) · 110 UNVERIFIED |

## Gate outcomes

| Gate | Goal | Outcome |
|---|---|---|
| Land repairs | KYC 067 + lint overrides + restore-failure | Landed; regressions retained |
| Gate 1 | FAIL **005** → PASS | **PASS** — Identity + Stays `lint:check` exit 0 ([evidence/r3/005-lint/](../evidence/r3/005-lint/)) |
| Gate 2 | FAIL **034** → PASS | **PASS** — DEMO expiry/consumed enforced ([evidence/r3/034-otp/](../evidence/r3/034-otp/)) |
| Gate 3 | P0 authz **041–048** | **PASS** — including consumer SUSPENDED ([evidence/r3/041-048-authz/](../evidence/r3/041-048-authz/)) |
| Gate 4 | Encrypted R2 restore | **PASS** — VPS `restore-r2-drill.sh` set `2026-09-07_02-15-51_srv1894430`; identity+stays OK; production unchanged; alerts sent ([evidence/r3/restore/](../evidence/r3/restore/)) |

## Matrix updates (original IDs only)

| ID | Before | After | Notes |
|---|---|---|---|
| 005 | FAIL | **PASS** | Certified Nest surface 0 errors |
| 034 | FAIL | **PASS** | Expired + consumed DEMO reject |
| 036 | UNVERIFIED | UNVERIFIED | Attempt-limit matrix still incomplete |
| 041–048 | UNVERIFIED | **PASS** | BOLA matrix + AccountStatusGuard |
| 029–030 | PASS (local) | **PASS** (local + R2 VPS drill) | Evidence upgraded with production encrypted pipeline |

## Findings → remediation → retest

### F-R3-1 — Lint (005)
Certified surface; `lint:check` exit 0. Evidence: `evidence/r3/005-lint/`.

### F-R3-2 — OTP expiry (034)
DEMO code match only on live OTP rows; expiry/consumed always enforced. Evidence: `evidence/r3/034-otp/`.

### F-R3-3 — Authz (041–048)
BOLA matrix + `AccountStatusGuard` for SUSPENDED/FROZEN/BANNED. Evidence: `evidence/r3/041-048-authz/`.

### F-R3-4 — Encrypted R2 recovery (Gate 4)
**VPS operator drill PASS** on set `2026-09-07_02-15-51_srv1894430`: R2 retrieve → age decrypt → isolated restore → data/schema/query OK → production containers unchanged → success alerts (email+webhook). Temporary age key removed after drill. Evidence: `evidence/r3/restore/r2-drill-vps.txt`, `gate4-result.md`.

## Validation ledger (R3 delta)

| Check | Result |
|---|---|
| Identity + Stays `lint:check` | exit 0 |
| OTP expiry/consumed | PASS |
| AccountStatusGuard / BOLA Jest | PASS |
| Local age encrypt drill | PASS |
| VPS `restore-r2-drill.sh` | **PASS** |
| Success alert path during drill | **PASS** (email+webhook) |

Frozen integration statement unchanged for payments/KYC/SMS/payouts. No provider activation by this audit.

## Separation from R1/R2

Alternate-numbered R1/R2 reports remain historical only; do not import their IDs into this matrix.

## Remaining blockers (non-exhaustive)

1. Original UNVERIFIED production-adjacent items (CMI 075–084, SMS delivery, Sumsub live E2E, payouts, VPS TLS/firewall rows 011–020, devices, CWV, …)  
2. OTP attempt limits **036**  
3. Broader soft-launch product/UI coverage still incomplete on the original checklist  

## Commits / deploy

Evidence/report update committed to backend. **No deploy / no frozen-flag flips.**
