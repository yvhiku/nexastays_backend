# VPS FIRST DEPLOYMENT SAFETY REMEDIATION (B1–B8)

Date: 2026-08-10  
Scope: Repository hardening only  
**No VPS connection. No live deployment. No production secret creation.**

## Summary statuses

| ID | Topic | Status |
|----|-------|--------|
| B1 | CI rsync must not delete host secrets | **CLOSED** (implemented + local regression). Live Actions against a host = **NOT VERIFIED**. |
| B2 | Backup install `rsync --delete` wipe risk | **CLOSED** ( `--delete` removed; dedicated checkout model). Live install = **NOT VERIFIED**. |
| B3 | Backup env silent production default | **CLOSED** (`--stage` required; stage templates). |
| B4 | Timer armed unsafely | **CLOSED** (default: not enabled; `--enable-timer` opt-in + placeholder guard). |
| B5 | External volume bootstrap on blank VPS | **CLOSED** (`ensure-vps-volumes.sh` + compose docs). Live docker = **NOT VERIFIED**. |
| B6 | Dev DB passwords on dogfood/prod | **CLOSED** (compose override + fail-closed asserts in deploy/DB scripts). Local `*_dev` defaults retained for development. |
| B7 | Bootstrap chicken-and-egg | **CLOSED** (documented blank-VPS order in `VPS_DOGFOOD.md`). |
| B8 | `.env` chmod 600 not enforced | **CLOSED** (`secure-env-perms`, install templates, check-env mode fail-closed). |

Nothing above is live-VPS **VERIFIED**.

---

## Per-blocker notes

### B1 — CLOSED (repo)
- Added `deploy/scripts/ci-rsync-excludes.txt` and `sync-deploy-package.sh`.
- Staging/production workflows call the helper (no inline unsafe exclude-only-`.env` rsync).
- Host-owned: `.env`, `.env.*`, `.env.backup`, `.deploy-logs/`, PEMs, local Caddyfile.
- CI-owned: committed release files under `deploy/`.
- Test: `deploy/scripts/test-deploy-sync-safety.sh`.

### B2 — CLOSED (repo)
- `/opt/nexa/database` = dedicated database repo checkout.
- `install-systemd-backup.sh` uses `rsync -a` **without** `--delete`.
- Dumps/logs/host-only files under DEST are preserved by design.
- Test: `database/scripts/test-vps-safety.sh`.

### B3 — CLOSED (repo)
- Installer requires `--stage dogfood|staging|production`.
- Templates under `database/scripts/env/backup.<stage>.env.example`.
- Production template keeps remote mandatory flags; dogfood does not fail-closed on remote.

### B4 — CLOSED (repo)
- Default install: units present, timer **not** enabled.
- `--enable-timer` refused while placeholders/`*_dev` remain in `/etc/nexa/backup.env`.
- Printed command sequence: edit → validate → manual service → enable timer.

### B5 — CLOSED (repo)
- External volume names retained (`identity_identity_pg_data`, `stays_stays_pg_data`) to avoid renaming existing data.
- `ensure-vps-volumes.sh` idempotently `docker volume create`s missing volumes.
- No `down -v`, no deletes.

### B6 — CLOSED (repo)
- Compose: `${IDENTITY_DB_PASSWORD:-nexa_identity_dev}` / stays equivalent (local default OK).
- VPS: `docker-compose.vps.env.example` + `assert-vps-db-env.sh`.
- `check-env.sh` rejects known-dev / placeholder URLs and short passwords for dogfood/staging/production.

### B7 — CLOSED (repo)
- `VPS_DOGFOOD.md` defines: provider admin → `whoami` → clone/scp → bootstrap from `/tmp/...` → rsync into `/opt/nexa` → Docker → secrets → volumes → deploy.
- No `curl | bash`. No SSH hardening before second session.

### B8 — CLOSED (repo)
- `secure-env-perms.sh`, `install-dogfood-env-templates.sh` (umask 077 + chmod 600).
- Backup env `install -m 600`.
- `check-env.sh` fails if env files are not 600/400.
- `remote-deploy.sh` re-secures `.env` / `.env.bak` after `sed`.

---

## Files changed

### backend
- `.github/workflows/deploy-staging.yml`, `deploy-production.yml`
- `deploy/scripts/ci-rsync-excludes.txt`, `sync-deploy-package.sh`, `test-deploy-sync-safety.sh`
- `deploy/scripts/check-env.sh`, `test-check-env.sh`, `remote-deploy.sh`, `vps-bootstrap.sh`
- `deploy/scripts/secure-env-perms.sh`, `install-dogfood-env-templates.sh`
- `deploy/VPS_DOGFOOD.md`
- `docs/audits/VPS_FIRST_DEPLOYMENT_SAFETY_REMEDIATION.md`

### database
- `scripts/install-systemd-backup.sh`, `validate-backup-env.sh`, `ensure-vps-volumes.sh`, `assert-vps-db-env.sh`
- `scripts/env/backup.{dogfood,staging,production}.env.example`
- `scripts/test-vps-safety.sh`
- `docker-compose.yml`, `docker-compose.vps.env.example`, `.env.backup.example`

---

## Tests executed (repository-local)

```text
bash -n (changed shell scripts)
bash deploy/scripts/test-check-env.sh
bash deploy/scripts/test-deploy-sync-safety.sh
bash database/scripts/test-vps-safety.sh
bash database/scripts/test-backup-policy.sh   # if present / still green
```

Live VPS / DNS / TLS / timer / cloud remote / Actions SSH: **NOT RUN**.

---

## Commands now safe for first VPS deployment (after owner secrets/DNS/Docker)

See `backend/deploy/VPS_DOGFOOD.md` Steps 0–9. Highlighted safe first commands:

```bash
whoami && pwd && uname -a
sudo bash /tmp/nexa-backend/deploy/scripts/vps-bootstrap.sh
NEXA_ENV=dogfood bash /opt/nexa/database/scripts/assert-vps-db-env.sh .env.db
bash /opt/nexa/database/scripts/ensure-vps-volumes.sh
sudo bash /opt/nexa/database/scripts/install-systemd-backup.sh --stage dogfood
```

## Commands explicitly prohibited until deployment verification

- `docker compose down -v`
- `install-systemd-backup.sh --enable-timer` before successful manual backup + validate
- SSH lockout (`PasswordAuthentication no` / `PermitRootLogin no`) before second confirmed session
- Claiming production RPO/RTO or TLS VERIFIED
- Enabling CMI / real-money payments
- Actions deploy until host secrets exist and excludes are in use (**workflow fixed in repo; live run still NOT VERIFIED**)

## Remaining owner inputs

- VPS access details, OS, DNS names, Twilio, JWT/PII secrets, GHCR pull, strong DB passwords
- Distro Docker install
- Confirm second SSH session before hardening

## Remaining external verification

- Live compose up, migrate, remote-deploy, smoke, Caddy TLS, firewall, backup timer on VPS
- GitHub Actions end-to-end deploy
- Off-site object storage for production backups

## STOP

Remediation limited to B1–B8. No PROD-OPS-002/003 reopen, no CMI, no object-storage production work, no VPS connection.
