# Soft-launch certification

Frozen posture: **mock payments**, **DEMO OTP (dogfood)**, **Sumsub sandbox** — do not flip in this cert.

## Original attachment audit — current for the requested 150 requirements

- **R9 (current):** [R9 report](./2026-09-07-original-checklist-audit/reports/2026-09-07_RELEASE_HARDENING_R9.md) — physical mobile deferred (no devices). Matrix **116 PASS / 0 FAIL / 34 UNVERIFIED**. Soft-launch leave-behind (CMI/SMS/Sumsub-prod/payouts) unchanged; plus honest holds 138/142/146/149/121–128.
- **R8:** [R8 report](./2026-09-07-original-checklist-audit/reports/2026-09-07_RELEASE_HARDENING_R8.md) — dogfood perf/restart + hygiene.
- **R7:** [R7 report](./2026-09-07-original-checklist-audit/reports/2026-09-07_RELEASE_HARDENING_R7.md) — security + mock notifications + ops subset.
- **R6:** [R6 report](./2026-09-07-original-checklist-audit/reports/2026-09-07_RELEASE_HARDENING_R6.md) — schema/host/admin/SEO.
- **R5:** [R5 report](./2026-09-07-original-checklist-audit/reports/2026-09-07_RELEASE_HARDENING_R5.md).
- **R4:** [R4 report](./2026-09-07-original-checklist-audit/reports/2026-09-07_RELEASE_HARDENING_R4.md).
- **R3:** [R3 report](./2026-09-07-original-checklist-audit/reports/2026-09-07_RELEASE_HARDENING_R3.md) — Gates 1–4 cleared.
- Baseline: [REPORT.md](./2026-09-07-original-checklist-audit/REPORT.md).
- [Exact original 001–150 matrix](./2026-09-07-original-checklist-audit/CHECKLIST.md) and [validation ledger](./2026-09-07-original-checklist-audit/VALIDATION.md).
- Evidence: [r3](./2026-09-07-original-checklist-audit/evidence/r3/) … [r9](./2026-09-07-original-checklist-audit/evidence/r9/).
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
