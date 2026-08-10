# NEXA STAYS — PROD-OPS-003 OBSERVABILITY & ALERTING REPORT

**Date:** 2026-08-10  
**Verdict:** **IMPLEMENTED — NOT VERIFIED**

## 1. Executive Summary

Implemented a provider-neutral observability foundation: structured JSON logging with redaction, validated request correlation IDs, `ErrorMonitoringService` (Sentry adapter when DSN present), `AlertingService` (webhook + console + dedupe), fatal process handlers, business/payment/financial/readiness/deploy/migration events, and production fail-closed config for real `NEXA_ENV=production`. No live external monitoring destination was exercised — status remains **IMPLEMENTED — NOT VERIFIED**.

## 2. Original Finding

PROD-OPS-003 — central error monitoring / payment alerts not wired (OPEN). Env vars existed without runtime integration.

## 3. Root Cause

Observability vars were documentary only; logs were mostly unstructured `console.*`; payment “refund required” was audit-only; no alert sink abstraction or production enforcement.

## 4–17. Architecture (summary)

See `.cursor/docs/operations/observability.md` and `alerting.md`.

- Logging / monitoring / alerting / on-call separated
- Request ID ALS + `X-Request-Id`
- Sentry via `ERROR_MONITORING_DSN` (optional package)
- Webhook via `OPS_ALERT_WEBHOOK_URL` / `PAYMENT_ALERT_WEBHOOK_URL`
- Payment alerts labeled `payment_mode=mock` when mock
- Financial invariant check is read-only + P0 alert + blocks confirm
- Dedupe 60s; severity P0–P3
- Deploy/migrate scripts emit `DEPLOYMENT_*` / `MIGRATION_*`

## 18. Files Changed

`platform/telemetry/*`, Identity/Stays observability modules, filters, safe-logger, payments, SMS, deploy scripts, database migrate-remote, docs, env examples.

## 19–20. Tests / Builds

Run Identity + Stays unit suites for observability + existing security/payment tests; both `npm run build`.

## 21. Verified locally

Unit tests for request ID, redaction, production fail-closed asserts, dedupe, financial invariant helper, internal test-alert gating; builds.

## 22. Requires external verification

1. Real `ERROR_MONITORING_DSN` → confirm Sentry event  
2. Real `OPS_ALERT_WEBHOOK_URL` → confirm delivery  
3. Staging deploy events visible in sink  
4. On-call mapping  
5. Frontend Sentry (DEFERRED)

## 23. Remaining findings

| ID | Status |
|----|--------|
| PROD-OPS-001 | PARTIALLY CLOSED |
| PROD-OPS-002 | IMPLEMENTED — NOT VERIFIED |
| PROD-OPS-003 | **IMPLEMENTED — NOT VERIFIED** |
| PROD-SEC-001 | OPEN |
| PROD-SEC-002 | OPEN |
| PROD-INV-001 | OPEN |
| SEC-007 | FUTURE CMI |

## 24. Final Verdict

**PROD-OPS-003: IMPLEMENTED — NOT VERIFIED**
