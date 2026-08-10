#!/usr/bin/env bash
# Create /opt/nexa layout and sketch deploy user. Run as root once.
# Does NOT overwrite secrets, SSH, or firewall. Does NOT start workloads.
set -euo pipefail

NEXA_ROOT="${NEXA_ROOT:-/opt/nexa}"
DEPLOY_USER="${DEPLOY_USER:-nexa}"
DEPLOY_GROUP="${DEPLOY_GROUP:-$DEPLOY_USER}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root (sudo) for first bootstrap." >&2
  exit 1
fi

echo "=== Creating ${NEXA_ROOT} layout ==="
install -d -m 755 \
  "${NEXA_ROOT}" \
  "${NEXA_ROOT}/backend" \
  "${NEXA_ROOT}/database" \
  "${NEXA_ROOT}/deploy" \
  "${NEXA_ROOT}/backups" \
  /var/log/nexa \
  /etc/nexa

if ! id -u "${DEPLOY_USER}" >/dev/null 2>&1; then
  echo "Creating user ${DEPLOY_USER} (no login password set by this script)"
  useradd --system --create-home --shell /bin/bash "${DEPLOY_USER}" || true
fi

chown -R "${DEPLOY_USER}:${DEPLOY_GROUP}" "${NEXA_ROOT}"
chown -R "${DEPLOY_USER}:${DEPLOY_GROUP}" /var/log/nexa
chmod 750 "${NEXA_ROOT}" "${NEXA_ROOT}/backups"
chmod 750 /etc/nexa

cat > "${NEXA_ROOT}/deploy/README.LAYOUT.txt" <<'EOF'
Nexa VPS layout
===============

/opt/nexa/backend     → clone or sync of backend (compose lives in backend/deploy)
/opt/nexa/database    → clone of database repo (migrations + backup scripts)
/opt/nexa/deploy      → operator notes / edge configs (Caddyfile, checklist)
/opt/nexa/backups     → optional local backup staging (prefer /var/backups/nexa)

Canonical app deploy path (Actions DEPLOY_PATH):
  /opt/nexa/backend/deploy

Canonical database path (Actions DATABASE_REPO_PATH):
  /opt/nexa/database

Backup env:
  /etc/nexa/backup.env   (chmod 600)

Dogfood env files (chmod 600, never commit):
  /opt/nexa/backend/deploy/.env
  /opt/nexa/backend/deploy/.env.identity
  /opt/nexa/backend/deploy/.env.stays
EOF

chown "${DEPLOY_USER}:${DEPLOY_GROUP}" "${NEXA_ROOT}/deploy/README.LAYOUT.txt"

echo "=== Next manual steps ==="
echo "1. Install Docker Engine + Compose plugin for ${DEPLOY_USER} (docker group = root-equivalent)."
echo "2. rsync/clone repos into ${NEXA_ROOT}/backend and ${NEXA_ROOT}/database (see VPS_DOGFOOD.md B7)."
echo "3. bash ${NEXA_ROOT}/backend/deploy/scripts/install-dogfood-env-templates.sh ${NEXA_ROOT}/backend/deploy"
echo "4. Edit secrets; keep chmod 600 (secure-env-perms.sh)."
echo "5. database: assert-vps-db-env + ensure-vps-volumes + compose --env-file .env.db up -d"
echo "6. DEPLOY_DIR=... bash vps-preflight.sh && IMAGE_TAG=<sha> remote-deploy.sh"
echo "7. Reverse proxy only after real DNS (edge/Caddyfile.dogfood.example)."
echo "8. Backups: install-systemd-backup.sh --stage dogfood (timer NOT enabled by default)."
echo
echo "SSH hardening and firewall remain operator-owned — never before a second confirmed session."
echo "Bootstrap complete (layout only; no workloads started)."
