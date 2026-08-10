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
echo "1. Install Docker Engine + Compose plugin for ${DEPLOY_USER} (docker group)."
echo "2. Clone repos as ${DEPLOY_USER} into /opt/nexa/backend and /opt/nexa/database."
echo "3. Copy env examples → .env / .env.identity / .env.stays and fill secrets."
echo "4. Start database compose (127.0.0.1 binds only)."
echo "5. Install reverse proxy (see deploy/edge/Caddyfile.dogfood.example)."
echo "6. Run: DEPLOY_DIR=/opt/nexa/backend/deploy bash /opt/nexa/backend/deploy/scripts/vps-preflight.sh"
echo "7. Deploy with IMAGE_TAG=<sha> DATABASE_REPO_PATH=/opt/nexa/database bash remote-deploy.sh"
echo
echo "SSH hardening, firewall, and DNS/TLS are operator-owned — see VPS_DOGFOOD.md"
echo "Bootstrap complete."
