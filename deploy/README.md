# Nexa Stays — Deploy package (PROD-OPS-002)

SSH + Docker Compose release control for Identity and Stays.

**Status:** IMPLEMENTED — NOT VERIFIED until a real staging (then production) host completes migrate → health → smoke.

Do not treat presence of these files as production verification.

## Architecture

```
PR → CI (lint/build/security tests)
 ↓
main → build immutable GHCR images (:$GITHUB_SHA, not :latest)
 ↓
workflow_dispatch staging → migrate → up → health → smoke
 ↓
workflow_dispatch production (GitHub Environment approval)
  → migrate → up → health → smoke → record release metadata
```

## Layout

| Path | Purpose |
|------|---------|
| `docker-compose.release.yml` | Identity + Stays runtime (immutable image tags) |
| `env/*.env.example` | Environment contracts (placeholders only) |
| `scripts/check-env.sh` | Fail-closed env preflight (no secret echo) |
| `scripts/remote-deploy.sh` | Host-side pull/migrate/up sequence |
| `scripts/smoke.sh` | Post-deploy smoke suite |
| `scripts/record-deployment.sh` | Append local deployment log (no secrets) |

Companion DB migrations: `database/scripts/migrate-remote.sh` (separate repo).

## Required GitHub configuration

### Environments

Create Environments: `staging`, `production`.

Production **must** require reviewers (Settings → Environments → production → Required reviewers).

### Secrets (per environment or repository)

| Secret | Purpose |
|--------|---------|
| `DEPLOY_HOST` | SSH hostname |
| `DEPLOY_USER` | SSH user |
| `DEPLOY_SSH_KEY` | Private key (PEM) |
| `DEPLOY_PATH` | Absolute path on host containing this `deploy/` tree |
| `DATABASE_REPO_PATH` | Absolute path on host to cloned `database` repo (for migrate-remote) |
| `SMOKE_IDENTITY_BASE_URL` | e.g. `https://identity.staging.example/api/v1` |
| `SMOKE_STAYS_BASE_URL` | e.g. `https://stays.staging.example/api/v1` |
| `SMOKE_CORS_ORIGIN_OK` | Allowed origin for CORS positive check |
| `SMOKE_CORS_ORIGIN_BAD` | Disallowed origin (expect rejection) |

Optional registry: workflows use `ghcr.io` + `GITHUB_TOKEN` (packages write permission).

Host `.env` for Compose is **never** committed — operators place `deploy/.env` from `env/*.env.example`.

## Image identity

```
ghcr.io/<owner>/nexa-identity:<git-sha>
ghcr.io/<owner>/nexa-stays:<git-sha>
```

Never deploy `:latest` as the release identity.

## Health probe contract

| Probe | Endpoint | Dependency | Expected failure |
|-------|----------|------------|------------------|
| Liveness | `GET /api/v1/health/live` (or `/ping`) | none | non-2xx |
| Readiness | `GET /api/v1/health/ready` | PostgreSQL | HTTP 503 |
| Legacy alias | `GET /api/v1/health` | PostgreSQL | HTTP 503 when not ok |
| Version | `GET /api/v1/version` | none | metadata only |

Docker HEALTHCHECK and load balancers must use **readiness**. Kubernetes (future): liveness → `/health/live`, readiness → `/health/ready`.

## Soft-launch payments

| NEXA_ENV | Mock payments |
|----------|---------------|
| `development` | allowed |
| `dogfood` | allowed (`NODE_ENV=production` OK) |
| `staging` | allowed only if `STAYS_PAYMENT_PROVIDER=mock` is **explicit** |
| `production` | **rejected** |

Real CMI is out of scope.

## Rollback (summary)

Application: redeploy previous `$GIT_SHA` image tags.

Database: **never** blindly downgrade schema. See rollback runbook.
