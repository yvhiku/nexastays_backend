#!/usr/bin/env bash
# VPS preflight for first dogfood/staging bring-up. Read-only checks; no secrets echoed.
set -euo pipefail

MIN_DISK_GB="${MIN_DISK_GB:-20}"
MIN_MEM_MB="${MIN_MEM_MB:-1800}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/nexa/backend/deploy}"
DATABASE_DIR="${DATABASE_DIR:-/opt/nexa/database}"
BACKUP_DIR="${BACKUP_DIR:-/opt/nexa/backups}"
FAIL=0

ok() { echo "PASS: $1"; }
bad() { echo "FAIL: $1" >&2; FAIL=$((FAIL + 1)); }
warn() { echo "WARN: $1" >&2; }

echo "=== Nexa VPS preflight ==="

if command -v docker >/dev/null 2>&1; then
  ok "docker present ($(docker --version | head -n1))"
else
  bad "docker not found"
fi

if docker compose version >/dev/null 2>&1; then
  ok "docker compose plugin present"
elif command -v docker-compose >/dev/null 2>&1; then
  warn "docker-compose standalone found; prefer Docker Compose v2 plugin"
  ok "docker-compose present"
else
  bad "docker compose not found"
fi

if command -v curl >/dev/null 2>&1; then ok "curl present"; else bad "curl missing"; fi
if command -v ss >/dev/null 2>&1 || command -v netstat >/dev/null 2>&1; then
  ok "port inspection tool present"
else
  warn "ss/netstat missing — skip live port bind checks"
fi

# Disk
if command -v df >/dev/null 2>&1; then
  avail_kb="$(df -Pk /opt 2>/dev/null | awk 'NR==2{print $4}')"
  if [[ -z "${avail_kb:-}" ]]; then
    avail_kb="$(df -Pk / | awk 'NR==2{print $4}')"
  fi
  avail_gb=$((avail_kb / 1024 / 1024))
  if [[ "$avail_gb" -ge "$MIN_DISK_GB" ]]; then
    ok "disk free ~${avail_gb}GiB (>= ${MIN_DISK_GB})"
  else
    bad "disk free ~${avail_gb}GiB (< ${MIN_DISK_GB})"
  fi
fi

# Memory
if [[ -r /proc/meminfo ]]; then
  mem_kb="$(awk '/MemTotal/{print $2}' /proc/meminfo)"
  mem_mb=$((mem_kb / 1024))
  if [[ "$mem_mb" -ge "$MIN_MEM_MB" ]]; then
    ok "memory ~${mem_mb}MiB (>= ${MIN_MEM_MB})"
  else
    bad "memory ~${mem_mb}MiB (< ${MIN_MEM_MB})"
  fi
fi

# Directories
for d in /opt/nexa /opt/nexa/backend /opt/nexa/database /opt/nexa/deploy /opt/nexa/backups; do
  if [[ -d "$d" ]]; then ok "dir $d"; else bad "missing dir $d (run vps-bootstrap.sh)"; fi
done

# Env files (presence only)
if [[ -f "$DEPLOY_DIR/.env" ]]; then ok "deploy .env present"; else bad "missing $DEPLOY_DIR/.env"; fi
if [[ -f "$DEPLOY_DIR/.env.identity" ]]; then ok "deploy .env.identity present"; else bad "missing $DEPLOY_DIR/.env.identity"; fi
if [[ -f "$DEPLOY_DIR/.env.stays" ]]; then ok "deploy .env.stays present"; else bad "missing $DEPLOY_DIR/.env.stays"; fi

if [[ -f "$DEPLOY_DIR/.env" && -f "$DEPLOY_DIR/scripts/check-env.sh" ]]; then
  if bash "$DEPLOY_DIR/scripts/check-env.sh" "$DEPLOY_DIR/.env" "$DEPLOY_DIR/.env.identity" "$DEPLOY_DIR/.env.stays"; then
    ok "check-env.sh"
  else
    bad "check-env.sh"
  fi
fi

# Required localhost ports for DB + Redis (must be free OR already owned by nexa compose)
check_local_port() {
  local port="$1"
  local role="$2"
  if command -v ss >/dev/null 2>&1; then
    if ss -lnt | grep -qE "127\\.0\\.0\\.1:${port}\\b|0\\.0\\.0\\.0:${port}\\b"; then
      ok "port ${port} listening (${role}) — ensure it is Nexa, not a foreign bind"
    else
      warn "port ${port} not listening yet (${role}) — start database compose before apps"
    fi
  fi
}
check_local_port 5433 "identity-db"
check_local_port 5434 "stays-db"
check_local_port 6379 "redis"
check_local_port 3001 "identity-api (after deploy)"
check_local_port 3002 "stays-api (after deploy)"

# Public exposure smell: Postgres on non-localhost
if command -v ss >/dev/null 2>&1; then
  if ss -lnt | grep -qE '0\\.0\\.0\\.0:5433\\b|:::5433\\b|0\\.0\\.0\\.0:5434\\b|:::5434\\b'; then
    bad "Postgres appears bound on all interfaces — must be 127.0.0.1 only"
  else
    ok "no all-interface Postgres listener detected for 5433/5434"
  fi
fi

# DNS optional checks (do not fail closed without domain)
for host in "${DOGFOOD_WEB_HOST:-}" "${DOGFOOD_IDENTITY_HOST:-}" "${DOGFOOD_STAYS_HOST:-}"; do
  [[ -z "$host" ]] && continue
  if getent hosts "$host" >/dev/null 2>&1 || host "$host" >/dev/null 2>&1; then
    ok "DNS resolves $host"
  else
    warn "DNS does not resolve $host (TLS not ready)"
  fi
done

if [[ ! -d "$DATABASE_DIR/scripts" ]]; then
  warn "database scripts missing under $DATABASE_DIR — clone database repo before migrate"
fi

if [[ ! -d "$BACKUP_DIR" ]]; then
  warn "backup dir missing: $BACKUP_DIR"
fi

echo "=== Preflight summary: failures=$FAIL ==="
[[ "$FAIL" -eq 0 ]]
