# Nexa Stays — Deploy package (PROD-OPS-002 + VPS dogfood prep)

SSH + Docker Compose release control for Identity and Stays.

**Status:** IMPLEMENTED — NOT VERIFIED until a real dogfood/staging host completes migrate → health → smoke.

Canonical first-deploy runbook: [`VPS_DOGFOOD.md`](./VPS_DOGFOOD.md)  
Readiness report: [`../docs/audits/VPS_FIRST_DEPLOYMENT_READINESS.md`](../docs/audits/VPS_FIRST_DEPLOYMENT_READINESS.md)  
Full VPS topology (Cloudflare → Nginx → Web/Dashboard/API + **Platform** → Postgres): [`../docs/deploy/VPS_ARCHITECTURE.md`](../docs/deploy/VPS_ARCHITECTURE.md)

## Architecture

```
PR → CI (lint/build/security tests)
 ↓
main → build immutable GHCR images (:$GITHUB_SHA, not :latest)
 ↓
manual dogfood OR workflow_dispatch staging → migrate → up → health → smoke
 ↓
workflow_dispatch production (GitHub Environment approval)
  → migrate → up → health → smoke → record release metadata
```

### Runtime topology (VPS)

```
Cloudflare → Nginx (80/443)
  → Web :3005 · Dashboard :3006 · Identity :3001 · Stays :3002
  → Platform (notifications :3003 · media :3004 · consumers)
  → Postgres (identity :5433 · stays :5434) + Redis :6379
```

Release Compose in this folder covers **Identity + Stays** images. Data plane, Platform, Web, Dashboard, and Nginx are documented in `docs/deploy/VPS_ARCHITECTURE.md`.

## Layout

| Path | Purpose |
|------|---------|
| `docker-compose.release.yml` | Identity + Stays (127.0.0.1 binds, dual env files) |
| `env/*.env.example` | Shared + per-service DB contracts |
| `edge/Caddyfile.dogfood.example` | TLS reverse-proxy example (operator-owned) |
| `scripts/check-env.sh` | Fail-closed env preflight |
| `scripts/vps-bootstrap.sh` | `/opt/nexa` directory bootstrap |
| `scripts/vps-preflight.sh` | Host readiness checks |
| `scripts/remote-deploy.sh` | Migrate → pull → up → ready |
| `scripts/smoke.sh` | Post-deploy smoke suite |
| `scripts/smoke-dogfood-checklist.md` | Extended dogfood checklist |
| `scripts/record-deployment.sh` | Local deployment log (no secrets) |
| `VPS_DOGFOOD.md` | First VPS deployment runbook |

Companion DB migrations / backups: `database` repo (`migrate-remote.sh`, systemd backup timer).

## Host paths

| Role | Path |
|------|------|
| Deploy package (`DEPLOY_PATH`) | `/opt/nexa/backend/deploy` |
| Database repo (`DATABASE_REPO_PATH`) | `/opt/nexa/database` |
| Operator edge notes | `/opt/nexa/deploy` |
| Backups staging | `/opt/nexa/backups` (+ `/var/backups/nexa`) |
| Backup env | `/etc/nexa/backup.env` |

Host files (never committed): `.env`, `.env.identity`, `.env.stays`.

CI sync uses `scripts/sync-deploy-package.sh` + `scripts/ci-rsync-excludes.txt` so host-owned secrets survive `rsync --delete`.

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
| `DEPLOY_PATH` | Absolute path to `deploy/` on host (`/opt/nexa/backend/deploy`) |
| `DATABASE_REPO_PATH` | Absolute path to database repo (`/opt/nexa/database`) |
| `SMOKE_IDENTITY_BASE_URL` | e.g. `https://identity.staging.example/api/v1` |
| `SMOKE_STAYS_BASE_URL` | e.g. `https://stays.staging.example/api/v1` |
| `SMOKE_CORS_ORIGIN_OK` | Allowed origin for CORS positive check |
| `SMOKE_CORS_ORIGIN_BAD` | Disallowed origin (expect rejection) |

Host `.env*` for Compose is **never** committed — operators place files from `env/*.env.example`.

## Soft-launch payments

| NEXA_ENV | Mock payments |
|----------|---------------|
| `dogfood` | **required** (`STAYS_PAYMENT_PROVIDER=mock`) |
| `staging` | **required** mock |
| `production` | **rejected** |

Real CMI is out of scope.

## Health probe contract

| Probe | Endpoint | Expected failure |
|-------|----------|------------------|
| Liveness | `GET /api/v1/health/live` | non-2xx |
| Readiness | `GET /api/v1/health/ready` | HTTP 503 if DB down |
| Alias | `GET /api/v1/health` | 503 when not ok |
| Version | `GET /api/v1/version` | metadata |

Compose HEALTHCHECK and reverse proxies must use **readiness**.

## Rollback (summary)

Application: redeploy previous `$GIT_SHA` image tags (`SKIP_MIGRATE=1` if schema unchanged).

Database: **never** blindly downgrade schema. See rollback runbook.
