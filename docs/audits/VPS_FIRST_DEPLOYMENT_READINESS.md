# VPS FIRST DEPLOYMENT READINESS

Date: 2026-08-10  
Scope: Dogfood / staging first controlled VPS deployment (mock payments only)  
Live VPS execution: **NOT PERFORMED** (no host access in this pass)

## Final verdict

**Repository-side VPS deployment support: IMPLEMENTED — NOT VERIFIED**  
**Live VPS deployment: NOT IMPLEMENTED / BLOCKED pending VPS access details**

> VPS deployment execution is blocked pending actual VPS access details
> (IP/hostname, SSH credentials, DNS names, secret material, GHCR pull access).

Do not claim dogfood is live. Do not claim production RPO/RTO. CMI remains FUTURE.

---

## 1. Deployment topology (from repository ports)

```
Internet
  ↓  public TCP 80/443 only
DNS → VPS
  ↓
Reverse proxy + TLS (Caddy example; operator-owned)
  ↓
Web :3005 (optional; not in release compose / no Dockerfile yet)
Identity 127.0.0.1:3001
Stays    127.0.0.1:3002
  ↓  host.docker.internal → host-gateway
Identity PG 127.0.0.1:5433
Stays PG    127.0.0.1:5434
Redis       127.0.0.1:6379
```

Sources: `backend/deploy/docker-compose.release.yml`, `database/docker-compose.yml`, `backend/deploy/VPS_DOGFOOD.md`.

---

## 2. Exact services required (dogfood minimum)

| Service | Required? | How |
|---------|-----------|-----|
| Identity PostgreSQL | Yes | `database/docker-compose.yml` |
| Stays PostgreSQL | Yes | same |
| Redis | Yes | same |
| Migrations | Yes | `database/scripts/migrate-remote.sh` |
| Identity API | Yes | GHCR `nexa-identity:<sha>` |
| Stays API | Yes | GHCR `nexa-stays:<sha>` |
| Reverse proxy + DNS/TLS | Yes for public dogfood | operator (Caddy example provided) |
| Twilio | Yes (`NODE_ENV=production`) | secrets on host |
| Web (Next.js) | Optional first slice | no release Dockerfile — NOT PACKAGED |
| Media-service | Optional dogfood | local Stays disk OK when `NEXA_ENV=dogfood` |
| Notifications | Optional | degraded without it |
| Backup systemd timer | Strongly recommended | PROD-OPS-001 packaging |

---

## 3–4. Public vs internal ports

### Public (firewall allowlist)

| Port | Role |
|------|------|
| 22 | SSH (restrict source if possible) |
| 80 | HTTP → ACME / redirect |
| 443 | HTTPS reverse proxy |

### Internal only (must NOT be public)

| Port | Role |
|------|------|
| 3001 | Identity (loopback bind) |
| 3002 | Stays (loopback bind) |
| 3003 | Notifications |
| 3004 | Media internal API |
| 3005 | Web process (when present) |
| 5433 | Identity Postgres |
| 5434 | Stays Postgres |
| 6379 | Redis |
| 55433 / 55434 | Restore-drill Postgres |
| 9000 / 9001 | MinIO (dogfood-only if used) |

---

## 5. VPS directory layout

```
/opt/nexa/backend     # backend clone; compose at backend/deploy
/opt/nexa/database    # database clone
/opt/nexa/deploy      # edge / operator notes
/opt/nexa/backups     # optional local staging
/etc/nexa/backup.env  # backup secrets (chmod 600)
/var/backups/nexa     # dump directory (recommended)
```

Bootstrap script: `backend/deploy/scripts/vps-bootstrap.sh`.

---

## 6–7. Environment variables & secrets

Shared (`.env`): `NEXA_ENV=dogfood`, `NODE_ENV=production`, `IMAGE_REGISTRY`, `IMAGE_TAG`, migrate URLs, JWT/PII/Twilio/CORS/`INTERNAL_SERVICE_KEY`, `STAYS_PAYMENT_PROVIDER=mock`, Redis URL.

Per-service: `.env.identity` / `.env.stays` with distinct `DB_*`.

Templates: `backend/deploy/env/dogfood*.env.example`.

Secrets created **manually on VPS** — never committed.

Observability for dogfood: `ERROR_MONITORING_DSN` / `OPS_ALERT_WEBHOOK_URL` **optional** (required only for `NEXA_ENV=production`).

---

## 8–10. DNS, TLS, firewall

| Item | Status |
|------|--------|
| DNS A/AAAA → VPS | NOT VERIFIED (owner) |
| TLS certificates | NOT VERIFIED (needs DNS) |
| Firewall 22/80/443 only public | CHECKLIST documented; NOT VERIFIED |

Example edge: `backend/deploy/edge/Caddyfile.dogfood.example`.

---

## 11. Deployment commands

```bash
sudo bash /opt/nexa/backend/deploy/scripts/vps-bootstrap.sh
cd /opt/nexa/database && docker compose up -d
DEPLOY_DIR=/opt/nexa/backend/deploy bash /opt/nexa/backend/deploy/scripts/vps-preflight.sh
cd /opt/nexa/backend/deploy
export IMAGE_TAG=<sha> DATABASE_REPO_PATH=/opt/nexa/database
bash scripts/remote-deploy.sh
SMOKE_EXPECT_NEXA_ENV=dogfood bash scripts/smoke.sh   # with SMOKE_* URLs
```

---

## 12. Migration sequence

1. Optional: DB backup before risky upgrades  
2. `IDENTITY_DATABASE_URL` + `STAYS_DATABASE_URL` from `.env`  
3. Identity SQL → Stays SQL (`migrate-remote.sh`)  
4. On failure: **stop** — do not start new app images  
5. Compose pull/up  
6. Readiness `/api/v1/health/ready`  
7. Smoke  

No automatic schema rollback.

---

## 13. Rollback procedure

1. Identify running `IMAGE_TAG` vs previous SHA  
2. Redeploy previous SHA (`SKIP_MIGRATE=1` if schema unchanged)  
3. Confirm ready + smoke  
4. If irreversible migration already applied: app rollback may be unsafe — owner-approved DB restore only (PROD-OPS-001). PITR **NOT IMPLEMENTED**.

---

## 14–15. Backup schedule & remote-copy policy (dogfood)

| Item | Dogfood policy |
|------|----------------|
| Timer | `nexa-db-backup.timer` 02:15 UTC (after install) |
| Overlap | flock lock |
| Integrity | dump checks + sha256/manifest (tooling) |
| Remote require | **OFF** fail-closed (`BACKUP_REQUIRE_REMOTE=false`) |
| Recommended | filesystem remote under `/opt/nexa/backups/offhost` |
| Production remote | mandatory — **NOT VERIFIED** here |
| VPS backup run this pass | **NOT RUN** (no VPS) |

---

## 16. Smoke-test results

| Suite | Result |
|-------|--------|
| `deploy/scripts/test-check-env.sh` | RUN in this pass (see Tests) |
| `deploy/scripts/smoke.sh` against live dogfood | **NOT RUN** (no VPS/DNS) |
| Extended dogfood checklist | Template only — **NOT RUN** |

---

## 17. Status matrix

| Area | Status |
|------|--------|
| Dual-env compose + localhost binds | **IMPLEMENTED** |
| Migrate URLs loaded from `.env` | **IMPLEMENTED** |
| `/opt/nexa` bootstrap + preflight | **IMPLEMENTED** |
| Caddy edge example | **IMPLEMENTED** (config only) |
| Fail-closed dogfood mock payments | **IMPLEMENTED** (+ unit script) |
| GHCR images / Actions workflows | **IMPLEMENTED — NOT VERIFIED** |
| Live VPS Docker data plane | **NOT VERIFIED** |
| Live app deploy | **NOT VERIFIED** |
| DNS/TLS | **NOT VERIFIED** |
| Firewall/SSH hardening on host | **NOT VERIFIED** |
| Web release packaging | **NOT IMPLEMENTED** |
| Media-service Docker/release compose | **NOT IMPLEMENTED** (dogfood local OK) |
| Backup timer on VPS | **NOT VERIFIED** |
| Sentry + alert webhook delivery | **NOT VERIFIED** |
| Production cloud backup remote | **NOT VERIFIED** |
| PITR | **NOT IMPLEMENTED** |
| CMI / real money | **DEFERRED / FUTURE** |

---

## 18. Remaining blockers (owner)

1. Provide VPS IP/hostname + SSH user/key  
2. Create DNS records  
3. Install Docker; run bootstrap; fill `.env*` + Twilio  
4. GHCR pull permissions for the VPS  
5. Start DB compose → preflight → `remote-deploy.sh` → smoke  
6. Install backup systemd + configure dogfood remote filesystem path  
7. Optionally bring web + observability DSN  

---

## Exact next manual VPS steps

1. Share access details with the operator (out of band).  
2. `sudo bash scripts/vps-bootstrap.sh`  
3. Clone `backend` + `database` under `/opt/nexa`  
4. Copy dogfood env examples → fill secrets (`chmod 600`)  
5. `docker compose up -d` in database repo  
6. Install Caddy using the example hostnames once DNS resolves  
7. `vps-preflight.sh` then `IMAGE_TAG=<sha> remote-deploy.sh`  
8. Run `smoke.sh` + dogfood checklist  
9. Install `nexa-db-backup.timer`; run one manual backup; record sizes (still not production RPO)  

---

## Files changed (this pass)

### backend
- `deploy/docker-compose.release.yml`
- `deploy/env/dogfood.env.example` (+ identity/stays)
- `deploy/env/staging.env.example` (+ identity/stays)
- `deploy/env/production.env.example`
- `deploy/scripts/check-env.sh`, `remote-deploy.sh`
- `deploy/scripts/vps-bootstrap.sh`, `vps-preflight.sh`, `test-check-env.sh`
- `deploy/scripts/smoke-dogfood-checklist.md`
- `deploy/edge/Caddyfile.dogfood.example`
- `deploy/VPS_DOGFOOD.md`, `deploy/README.md`
- `docs/audits/VPS_FIRST_DEPLOYMENT_READINESS.md`

### database
- `.env.backup.example` (dogfood backup policy defaults)

### docs
- `.cursor/docs/security/status.md` (deployment line)

## Commits

- backend: `c3f932e` — Prepare VPS dogfood deployment package without claiming live verify.
- backend: `e8d453b` — Record VPS readiness report commit hashes after push.
- database: `38aa0c2` — Document dogfood VPS backup remote policy defaults.


## Tests / builds

- `bash deploy/scripts/test-check-env.sh` — expected PASS  
- Live deploy/smoke/build against VPS — NOT RUN
