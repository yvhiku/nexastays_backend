# Nexa Stays — VPS dogfood / first controlled deployment

**Status:** Repository preparation **IMPLEMENTED**. Live VPS execution **NOT VERIFIED**.

Do not treat this document as proof of a completed deployment.

## Blank VPS → first boot (B7 — exact order)

Do **not** harden SSH, disable passwords, or set `PermitRootLogin no` until a **second** admin session is confirmed.

### Ownership model

| Actor | Role |
|-------|------|
| Provider admin (e.g. `root` / `ubuntu` / `debian`) | First login; install Docker; create layout; optional create `nexa` user |
| `nexa` (or `DEPLOY_USER`) | Day-2 deploy/ops user; may be in `docker` group (treat as root-equivalent) |
| GitHub Actions | Syncs **release files only** under `DEPLOY_PATH` — never host secrets |

### Step 0 — Confirm access (first command)

```bash
whoami && pwd && uname -a
```

### Step 1 — Place the backend repo on the VPS (required before bootstrap)

**Preferred (reproducible):** git clone over HTTPS or SSH to a temporary path, then move into `/opt/nexa` after bootstrap creates the layout:

```bash
# As provider admin — example only; use your real remotes / pinned tag or commit
cd /tmp
git clone https://github.com/OWNER/nexastays_backend.git nexa-backend
git clone https://github.com/OWNER/nexastays_db.git nexa-database
# Optional: git -C nexa-backend checkout <immutable-sha>
```

**Alternative:** `scp -r` a release tree from an operator workstation (no `curl | bash`).

Do **not** pipe unauthenticated scripts from the internet into a shell.

### Step 2 — Bootstrap layout (creates `/opt/nexa`, does not start workloads)

```bash
sudo bash /tmp/nexa-backend/deploy/scripts/vps-bootstrap.sh
```

### Step 3 — Install checkouts into canonical paths

```bash
sudo rsync -a /tmp/nexa-backend/ /opt/nexa/backend/
sudo rsync -a /tmp/nexa-database/ /opt/nexa/database/
sudo chown -R nexa:nexa /opt/nexa   # if deploy user exists
```

### Step 4 — Docker Engine + Compose plugin

Install using your distro’s documented Docker method (owner/distro-specific). Confirm:

```bash
docker --version && docker compose version
```

### Step 5 — Host-owned secrets (chmod 600 enforced)

```bash
cd /opt/nexa/backend/deploy
sudo -u nexa bash scripts/install-dogfood-env-templates.sh .
# edit .env .env.identity .env.stays — strong secrets, NEXA_ENV=dogfood, STAYS_PAYMENT_PROVIDER=mock
bash scripts/secure-env-perms.sh .env .env.identity .env.stays
```

### Step 6 — Data plane (volumes + non-dev passwords)

```bash
cd /opt/nexa/database
cp docker-compose.vps.env.example .env.db
chmod 600 .env.db
# set IDENTITY_DB_PASSWORD / STAYS_DB_PASSWORD (not *_dev)
NEXA_ENV=dogfood bash scripts/assert-vps-db-env.sh .env.db
bash scripts/ensure-vps-volumes.sh
docker compose --env-file .env.db -f docker-compose.yml up -d
```

### Step 7 — Preflight + app deploy

```bash
DEPLOY_DIR=/opt/nexa/backend/deploy bash /opt/nexa/backend/deploy/scripts/vps-preflight.sh
cd /opt/nexa/backend/deploy
export IMAGE_TAG=<immutable-git-sha>
export DATABASE_REPO_PATH=/opt/nexa/database
bash scripts/remote-deploy.sh
```

### Step 8 — Edge / TLS only after real DNS

Use `edge/Caddyfile.dogfood.example` with real hostnames. TLS remains **NOT VERIFIED** until certificates issue.

### Step 9 — Backups (optional on first day; safe defaults)

```bash
sudo bash /opt/nexa/database/scripts/install-systemd-backup.sh --stage dogfood
# edit /etc/nexa/backup.env — then:
sudo bash /opt/nexa/database/scripts/validate-backup-env.sh
sudo systemctl start nexa-db-backup.service
# only after success:
sudo bash /opt/nexa/database/scripts/install-systemd-backup.sh --stage dogfood --enable-timer
```

---

## CI vs host ownership (B1)

| Path under `DEPLOY_PATH` (`/opt/nexa/backend/deploy`) | Owner |
|------------------------------------------------------|--------|
| `docker-compose.release.yml`, `scripts/`, `env/*.example`, `edge/*.example`, docs | **CI / git** (rsync) |
| `.env`, `.env.identity`, `.env.stays`, `.env.*`, `.env.backup`, `.deploy-logs/`, local `Caddyfile`, PEMs | **Host only** (excluded from delete) |

Sync helper: `scripts/sync-deploy-package.sh` + `scripts/ci-rsync-excludes.txt`.

---

## Topology (repository ports)

```
Internet → DNS → TLS proxy (80/443)
  → 127.0.0.1:3001 Identity / :3002 Stays
  → 127.0.0.1:5433 / 5434 Postgres + :6379 Redis
```

Must **not** be public: 5433, 5434, 6379, 3001–3004, MinIO/restore ports.

---

## Payments

`NEXA_ENV=dogfood` + `STAYS_PAYMENT_PROVIDER=mock` (required). CMI out of scope.

## Prohibited until owner verification

- GitHub Actions deploy against a host that still uses old rsync excludes (workflows now fixed in-repo; live run still **NOT VERIFIED**)
- `docker compose down -v`
- Enabling backup timer before a successful manual backup
- SSH password/root lockout before a second confirmed session
- Claiming production RPO/RTO from dogfood backups
