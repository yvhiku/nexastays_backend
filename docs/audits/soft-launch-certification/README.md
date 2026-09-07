# Soft-launch certification

Frozen posture: **mock payments**, **DEMO OTP (dogfood)**, **Sumsub sandbox** — do not flip in this cert.

## Original attachment audit — current for the requested 150 requirements

- **R6 conversion (current):** [2026-09-07 original-checklist R6 report](./2026-09-07-original-checklist-audit/reports/2026-09-07_RELEASE_HARDENING_R6.md) — **88 PASS / 0 FAIL / 62 UNVERIFIED**. Soft-launch leave-behind (CMI/SMS/Sumsub-prod/payouts) unchanged. Production **NOT READY / NOT CERTIFIED**.
- **R5 conversion:** [R5 report](./2026-09-07-original-checklist-audit/reports/2026-09-07_RELEASE_HARDENING_R5.md) — 69 PASS / 0 FAIL / 81 UNVERIFIED.
- **R4 conversion:** [R4 report](./2026-09-07-original-checklist-audit/reports/2026-09-07_RELEASE_HARDENING_R4.md) — 62 PASS / 0 FAIL / 88 UNVERIFIED.
- **R3 hardening:** [R3 report](./2026-09-07-original-checklist-audit/reports/2026-09-07_RELEASE_HARDENING_R3.md) — Gates 1–4 cleared (lint/OTP/authz/R2 restore).
- Baseline original report (pre-R3): [REPORT.md](./2026-09-07-original-checklist-audit/REPORT.md).
- [Exact original 001–150 matrix](./2026-09-07-original-checklist-audit/CHECKLIST.md) (R6-updated rows) and [validation ledger](./2026-09-07-original-checklist-audit/VALIDATION.md).
- Evidence: [evidence/r3/](./2026-09-07-original-checklist-audit/evidence/r3/), [evidence/r4/](./2026-09-07-original-checklist-audit/evidence/r4/), [evidence/r5/](./2026-09-07-original-checklist-audit/evidence/r5/), [evidence/r6/](./2026-09-07-original-checklist-audit/evidence/r6/).
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
