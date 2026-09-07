# Soft-launch certification

Frozen posture: **mock payments**, **DEMO OTP (dogfood)**, **Sumsub sandbox** — do not flip in this cert.

## Original attachment audit — current for the requested 150 requirements

- **R3 hardening (current):** [2026-09-07 original-checklist R3 report](./2026-09-07-original-checklist-audit/reports/2026-09-07_RELEASE_HARDENING_R3.md) — **48 PASS / 0 FAIL / 102 UNVERIFIED**. R3 Gates 1–4 **CLEARED** (incl. VPS encrypted R2 restore). Broader soft-launch matrix still incomplete; production **NOT READY / NOT CERTIFIED**.
- Baseline original report (pre-R3): [REPORT.md](./2026-09-07-original-checklist-audit/REPORT.md) — was 38 PASS / 2 FAIL / 110 UNVERIFIED.
- [Exact original 001–150 matrix](./2026-09-07-original-checklist-audit/CHECKLIST.md) (R3-updated rows) and [validation ledger](./2026-09-07-original-checklist-audit/VALIDATION.md).
- R3 evidence: [evidence/r3/](./2026-09-07-original-checklist-audit/evidence/r3/).
- This matrix retains the requirements from the user's attachment. The R1/R2 checklist below uses **different** requirements for the same numbers and is preserved as a separate historical audit; its results must not be substituted into the original matrix.

## Alternate-numbered R1/R2 audit (retained history — different IDs)

- [CHECKLIST_001_150.md](./CHECKLIST_001_150.md) — numbered **001–150** requirements (**alternate** text; e.g. their 005 ≠ lint)
- **Alternate R2 report (historical):** [reports/2026-09-07_150_CHECK_AUDIT_R2.md](./reports/2026-09-07_150_CHECK_AUDIT_R2.md) — local dogfood **READY** on *that* matrix only; production **NOT READY**
- R1 (historical): [reports/2026-09-07_150_CHECK_AUDIT.md](./reports/2026-09-07_150_CHECK_AUDIT.md)
- Evidence: [evidence/2026-09-07/](./evidence/2026-09-07/) (includes R2 baseline/, conversions, final-summary.md)
- Ops: [HOST_PAYOUT_MANUAL_SOP.md](../../ops/HOST_PAYOUT_MANUAL_SOP.md), [PAID_NO_BOOKING_TRACE.md](../../ops/PAID_NO_BOOKING_TRACE.md), [SOFT_LAUNCH_OPS.md](../../ops/SOFT_LAUNCH_OPS.md)

## Historical (not current certification)

- [LAUNCH_CERTIFICATION_PASSFAIL.md](./LAUNCH_CERTIFICATION_PASSFAIL.md) — earlier prefixed IDs
- [LAUNCH_CERTIFICATION_SCORECARD.md](./LAUNCH_CERTIFICATION_SCORECARD.md) — **2026-09-06 CONDITIONAL GO** (skipped PG concurrency / manual gaps; superseded by 150-check audit)

Workspace mirrors: `docs/00-overview/`.
