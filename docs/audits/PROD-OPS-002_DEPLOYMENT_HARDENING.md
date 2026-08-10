# NEXA STAYS — PROD-OPS-002 DEPLOYMENT HARDENING REPORT

**Date:** 2026-08-10  
**Verdict:** **IMPLEMENTED — NOT VERIFIED**

No shared staging or production host was deployed in this pass. Do not treat YAML/workflows as production verification.

## 1. Executive Summary

Hardened the path from PR → CI → immutable GHCR images → explicit staging/production SSH+Compose deploy with migrate-before-start, truthful readiness (HTTP 503), fail-closed payment/stage policy, smoke suite, and rollback documentation. Soft-launch mock payments require `NEXA_ENV=dogfood` (or explicit staging mock). Real `NEXA_ENV=production` + mock is rejected.

## 2. Files Changed (high level)

**backend:** Dockerfiles, health/version endpoints, CORS stage=`dogfood`, payment policy, `deploy/*`, GitHub Actions (`ci`, `build-images`, `deploy-staging`, `deploy-production`), tests, `.env.example` notes.

**database:** `scripts/migrate-remote.sh`, README, `.gitattributes`.

**docs (workspace `.cursor/docs`):** architecture/deployment, operations runbooks, security/status, workflows/deployment.

## 3. Deployment Architecture

SSH + Docker Compose on a VM; images from GHCR tagged `:GITHUB_SHA`; GitHub Environments `staging` / `production` (approval on production); concurrency groups serialize deploys.

## 4. Environment Model

| NEXA_ENV | NODE_ENV | Mock payments | CORS |
|----------|----------|---------------|------|
| development | development | allowed | local defaults OK |
| dogfood | production | allowed | CORS_ORIGINS required |
| staging | production | only if `STAYS_PAYMENT_PROVIDER=mock` explicit | required |
| production | production | **rejected** | required |

## 5. Docker Changes

Multi-stage `Dockerfile.prod`; `npm ci --omit=dev`; non-root; no `.env` copy; PORT 3001/3002; HEALTHCHECK → `/api/v1/health/ready` via `$PORT`.

## 6. Health / Readiness

- `/health/live` — process only  
- `/health/ready` + `/health` — DB; **503** when unavailable (PROD-OPS-005)  
- `/version` — safe release metadata  

## 7. Migration Strategy

Explicit `migrate-remote.sh` before compose up; failure stops deploy; no automatic schema rollback; expand→migrate→verify→contract documented.

## 8. CI/CD Changes

Separate CI / build-images / deploy-staging / deploy-production. Production never auto-deploys from developer branches. Secrets missing → clear fail (not fake credentials).

## 9. Smoke Tests

`deploy/scripts/smoke.sh`: live/ready, login reachable, anon rejection, explore browse, CORS negative check, swagger gate, version.

## 10. Rollback Strategy

App: redeploy prior SHA. DB: never blind downgrade; backup restore after owner decision (PROD-OPS-001).

## 11. Secret Handling

No secret echo in scripts; preflight prints names only; `.env` never in images/repo; PEM-safe env parsing (no `source` of multiline keys).

## 12. Test Results

Identity: cors/health/version suites PASS.  
Stays: cors/health/version/payment-policy/mock-confirm PASS.  
`check-env`: production+mock FAIL; dogfood+mock PASS.

## 13. Build Results

`identity` and `stays` `npm run build` PASS.

## 14. What Was Actually Verified

Local unit tests, builds, shell syntax, compose config shape, check-env policy, port healthcheck wiring in Dockerfiles.

## 15. What Remains Unverified

- Real staging SSH deploy / migrate / smoke  
- Real production deploy + approval path  
- GHCR push against live registry  
- Host Twilio/JWT/CORS with live DNS  
- PROD-OPS-003 monitoring  
- Frontend hosting promote path  

## 16. Remaining Findings

| ID | Status |
|----|--------|
| PROD-OPS-001 | PARTIALLY CLOSED |
| PROD-OPS-002 | **IMPLEMENTED — NOT VERIFIED** |
| PROD-OPS-003 | OPEN |
| PROD-SEC-001 | OPEN |
| PROD-SEC-002 | OPEN |
| PROD-INV-001 | OPEN |
| SEC-007 CMI | FUTURE CMI |

## 17. Final Verdict

**PROD-OPS-002: IMPLEMENTED — NOT VERIFIED**

External verification steps:

1. Create GitHub Environments + secrets  
2. Run Build release images on `main`  
3. Deploy staging with a real SHA → migrate → smoke  
4. Promote same SHA to production with approval  
5. File a deployment record with URLs + smoke log (redacted)
