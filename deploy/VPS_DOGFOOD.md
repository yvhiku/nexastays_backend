# Nexa Stays — VPS dogfood / first controlled deployment

**Status:** Repository preparation **IMPLEMENTED**. Live VPS execution **NOT VERIFIED** until the owner provides host access and DNS.

Do not treat this document as proof of a completed deployment.

## Topology (repository ports)

```
Internet
  ↓  TCP 80/443 (firewall allow)
DNS → VPS public IP
  ↓
Reverse proxy / TLS (Caddy or equivalent)     ← ONLY public entry
  ↓
127.0.0.1:3005  Web (optional first slice; no release Dockerfile yet)
127.0.0.1:3001  Identity
127.0.0.1:3002  Stays
  ↓
host.docker.internal → 127.0.0.1:5433 Identity PG
                     → 127.0.0.1:5434 Stays PG
                     → 127.0.0.1:6379 Redis
```

### Must NOT be public

| Port | Service |
|------|---------|
| 5433 | Identity PostgreSQL |
| 5434 | Stays PostgreSQL |
| 6379 | Redis |
| 55433 / 55434 | Restore-drill Postgres |
| 9000 / 9001 | Dogfood MinIO (if used) |
| 3003 | Notifications (if run) |
| 3004 | Media-service internal API (if run) |
| `/api/v1/metrics` | Internal metrics (X-Internal-Key in production Node) |

Release compose binds Identity/Stays to **127.0.0.1** only.

## Directory layout

```
/opt/nexa/
  backend/          # backend git clone; deploy package at backend/deploy
  database/         # database git clone
  deploy/           # edge configs, operator notes
  backups/          # optional local staging (prefer /var/backups/nexa for dumps)
```

Bootstrap: `sudo bash scripts/vps-bootstrap.sh`

## Minimum services (dogfood slice)

1. Identity Postgres + Stays Postgres + Redis (`database/docker-compose.yml`)
2. SQL migrations (`database/scripts/migrate-remote.sh`)
3. Identity + Stays containers (`docker-compose.release.yml`)
4. Reverse proxy + DNS + TLS
5. Explicit `NEXA_ENV=dogfood` + `STAYS_PAYMENT_PROVIDER=mock`
6. Twilio credentials (Identity boots with `NODE_ENV=production`)

Optional later: web process, media-service/MinIO, notifications, systemd backup timer.

## Environment files (secrets never in git)

| Host path | From |
|-----------|------|
| `/opt/nexa/backend/deploy/.env` | `env/dogfood.env.example` |
| `/opt/nexa/backend/deploy/.env.identity` | `env/dogfood.identity.env.example` |
| `/opt/nexa/backend/deploy/.env.stays` | `env/dogfood.stays.env.example` |
| `/etc/nexa/backup.env` | `database/.env.backup.example` |

### Required secrets (create on VPS)

- DB passwords (Identity + Stays)
- `PII_ENCRYPTION_KEY`
- JWT private/public PEM + peppers
- `ADMIN_PASSWORD_HASH`
- `INTERNAL_SERVICE_KEY`
- Twilio SID/token/from
- GHCR pull access for private packages (if applicable)
- Optional dogfood: `ERROR_MONITORING_DSN`, `OPS_ALERT_WEBHOOK_URL` (not required until `NEXA_ENV=production`)

## Payments

| Variable | Dogfood value |
|----------|---------------|
| `NEXA_ENV` | `dogfood` |
| `STAYS_PAYMENT_PROVIDER` | `mock` (required by `check-env.sh`) |

CMI / real money: **OUT OF SCOPE**.

## Media storage (dogfood vs production)

| Mode | When |
|------|------|
| **DOGFOOD LOCAL STORAGE** | `NEXA_ENV=dogfood` / `staging` without `MEDIA_SERVICE_URL` — Stays local disk OK |
| **DOGFOOD MINIO** (optional) | Media-service + S3-compatible MinIO on localhost — dogfood-only; not production proof |
| **PRODUCTION S3** | `NEXA_ENV=production` requires `MEDIA_SERVICE_URL` + S3; no local fallback |

## Deploy sequence

```bash
# 0) Once: bootstrap + Docker + clone repos + fill secrets
sudo bash /opt/nexa/backend/deploy/scripts/vps-bootstrap.sh

# 1) Data plane
cd /opt/nexa/database
docker compose -f docker-compose.yml up -d

# 2) Preflight
DEPLOY_DIR=/opt/nexa/backend/deploy \
  bash /opt/nexa/backend/deploy/scripts/vps-preflight.sh

# 3) Deploy apps (migrate → pull → up → ready)
cd /opt/nexa/backend/deploy
export IMAGE_TAG=<immutable-git-sha>
export DATABASE_REPO_PATH=/opt/nexa/database
bash scripts/remote-deploy.sh

# 4) Smoke (from CI or host with public HTTPS URLs)
export SMOKE_IDENTITY_BASE_URL=https://identity.example/api/v1
export SMOKE_STAYS_BASE_URL=https://stays.example/api/v1
export SMOKE_EXPECT_NEXA_ENV=dogfood
bash scripts/smoke.sh
# Extended checklist: scripts/smoke-dogfood-checklist.md
```

Migration order: **Identity SQL → Stays SQL**. Failure stops deploy; no automatic schema rollback.

## Rollback

1. Note current `IMAGE_TAG` (`docker compose … images` / `.deploy-logs`).
2. Redeploy previous SHA (`SKIP_MIGRATE=1` only if schema unchanged).
3. Migrations are **not** reversible by default — DB restore is an explicit owner decision (PROD-OPS-001).
4. See `.cursor/docs/operations/rollback-runbook.md`.

## Backups (dogfood policy)

| Item | Dogfood policy |
|------|----------------|
| Scheduler | systemd timer `nexa-db-backup.timer` (02:15 UTC) after install |
| Install | `database/scripts/install-systemd-backup.sh` → `/opt/nexa/database` |
| Remote require | **OFF** by default (`BACKUP_REQUIRE_REMOTE=false`, `NEXA_ENV=dogfood`) |
| Recommended | Enable filesystem remote to a second disk path or MinIO before real users |
| Production | Remote **mandatory** — do not claim production RPO/RTO from dogfood |

## Firewall (checklist)

- Allow: `22/tcp` (SSH, restricted source if possible), `80/tcp`, `443/tcp`
- Deny public: `3001–3004`, `5433`, `5434`, `6379`, `9000`, `9001`
- Confirm provider security group + host `ufw`/`firewalld` independently

## SSH hardening (checklist — do not lock yourself out)

1. Deploy user `nexa` with sudo for docker as needed
2. SSH key auth only; test a second session before disabling passwords
3. `PermitRootLogin no` only after key-based sudo works
4. Optional: `AllowUsers nexa`, fail2ban, non-default port

## TLS / DNS

- Create A/AAAA records for identity / stays / web hostnames → VPS IP
- Point Caddy (or equivalent) at those names
- **TLS VERIFIED = NO** until certificates issue against real DNS

## CI/CD

- `build-images.yml` → GHCR `:sha`
- `deploy-staging.yml` / `deploy-production.yml` → SSH + `remote-deploy.sh`
- Dogfood first bring-up is typically **manual SSH** using the same scripts
- Actions remain **NOT VERIFIED** until Environment secrets + successful run

## Observability

- Dogfood may omit `ERROR_MONITORING_DSN` / `OPS_ALERT_WEBHOOK_URL`
- Sentry event + webhook delivery remain **NOT VERIFIED** until exercised

## Blocked without owner input

**VPS deployment execution is blocked pending actual VPS access details**
(IP/hostname, SSH user/key, DNS names, GHCR visibility, Twilio, secret material).
