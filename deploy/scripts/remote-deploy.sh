#!/usr/bin/env bash
# Host-side deploy: preflight → backup → migrate → compose up → wait healthy.
# Does not print secret env values.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/.env}"
IDENTITY_ENV="${IDENTITY_ENV:-$DEPLOY_DIR/.env.identity}"
STAYS_ENV="${STAYS_ENV:-$DEPLOY_DIR/.env.stays}"
DATABASE_REPO_PATH="${DATABASE_REPO_PATH:?DATABASE_REPO_PATH required}"
BACKEND_IMAGE_TAG="${BACKEND_IMAGE_TAG:?BACKEND_IMAGE_TAG required}"
WEB_IMAGE_TAG="${WEB_IMAGE_TAG:?WEB_IMAGE_TAG required}"
DASHBOARD_IMAGE_TAG="${DASHBOARD_IMAGE_TAG:?DASHBOARD_IMAGE_TAG required}"
PLATFORM_IMAGE_TAG="${PLATFORM_IMAGE_TAG:-$BACKEND_IMAGE_TAG}"
SKIP_MIGRATE="${SKIP_MIGRATE:-0}"
SKIP_BACKUP="${SKIP_BACKUP:-0}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-nexa-apps}"

get_val() {
  local file="$1"
  local key="$2"
  awk -F= -v k="$key" '
    $0 ~ /^[[:space:]]*#/ { next }
    index($0, k "=") == 1 {
      print substr($0, length(k) + 2)
      exit
    }
  ' "$file"
}

cd "$DEPLOY_DIR"

bash "$SCRIPT_DIR/check-env.sh" "$ENV_FILE" "$IDENTITY_ENV" "$STAYS_ENV"
if [[ -f "$SCRIPT_DIR/assert-dogfood-secrets.sh" ]]; then
  nexa_env_pre="$(awk -F= '$1=="NEXA_ENV"{print substr($0,index($0,"=")+1); exit}' "$ENV_FILE" | tr -d '\r')"
  if [[ "$nexa_env_pre" == "dogfood" || "$nexa_env_pre" == "staging" ]]; then
    bash "$SCRIPT_DIR/assert-dogfood-secrets.sh" "$(cd "$(dirname "$ENV_FILE")" && pwd)"
  fi
fi
bash "$SCRIPT_DIR/emit-obs-event.sh" DEPLOYMENT_STARTED P3 '{}'

export IMAGE_REGISTRY
IMAGE_REGISTRY="$(get_val "$ENV_FILE" IMAGE_REGISTRY)"
export IMAGE_REGISTRY
export BUILD_VERSION
BUILD_VERSION="$(get_val "$ENV_FILE" BUILD_VERSION)"
export BUILD_VERSION
export BUILD_TIME
BUILD_TIME="$(get_val "$ENV_FILE" BUILD_TIME)"
export BUILD_TIME
IDENTITY_HOST_PORT="$(get_val "$ENV_FILE" IDENTITY_HOST_PORT)"
STAYS_HOST_PORT="$(get_val "$ENV_FILE" STAYS_HOST_PORT)"
IDENTITY_HOST_PORT="${IDENTITY_HOST_PORT:-3001}"
STAYS_HOST_PORT="${STAYS_HOST_PORT:-3002}"

if [[ -z "$IMAGE_REGISTRY" ]]; then
  echo "IMAGE_REGISTRY missing in $ENV_FILE" >&2
  exit 1
fi

for release_tag in "$BACKEND_IMAGE_TAG" "$PLATFORM_IMAGE_TAG" "$WEB_IMAGE_TAG" "$DASHBOARD_IMAGE_TAG"; do
  if [[ "$release_tag" == "latest" ]] || ! echo "$release_tag" | grep -qE '^[0-9a-f]{7,64}$'; then
    echo "Refusing non-immutable release tag" >&2
    exit 1
  fi
done

set_env_tag() {
  local key="$1"
  local value="$2"
  if grep -qE "^[[:space:]]*${key}=" "$ENV_FILE"; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

# Keep a recoverable record of the previously active immutable tags.
PREVIOUS_RELEASE_FILE="$DEPLOY_DIR/.release.previous.env"
{
  printf 'BACKEND_IMAGE_TAG=%s\n' "$(get_val "$ENV_FILE" BACKEND_IMAGE_TAG)"
  printf 'PLATFORM_IMAGE_TAG=%s\n' "$(get_val "$ENV_FILE" PLATFORM_IMAGE_TAG)"
  printf 'WEB_IMAGE_TAG=%s\n' "$(get_val "$ENV_FILE" WEB_IMAGE_TAG)"
  printf 'DASHBOARD_IMAGE_TAG=%s\n' "$(get_val "$ENV_FILE" DASHBOARD_IMAGE_TAG)"
} > "$PREVIOUS_RELEASE_FILE"
chmod 600 "$PREVIOUS_RELEASE_FILE"

set_env_tag BACKEND_IMAGE_TAG "$BACKEND_IMAGE_TAG"
set_env_tag PLATFORM_IMAGE_TAG "$PLATFORM_IMAGE_TAG"
set_env_tag WEB_IMAGE_TAG "$WEB_IMAGE_TAG"
set_env_tag DASHBOARD_IMAGE_TAG "$DASHBOARD_IMAGE_TAG"
bash "$SCRIPT_DIR/secure-env-perms.sh" "$ENV_FILE" "${ENV_FILE}.bak" "$PREVIOUS_RELEASE_FILE" 2>/dev/null || \
  bash "$SCRIPT_DIR/secure-env-perms.sh" "$ENV_FILE" "$PREVIOUS_RELEASE_FILE"

export BACKEND_IMAGE_TAG PLATFORM_IMAGE_TAG WEB_IMAGE_TAG DASHBOARD_IMAGE_TAG

if [[ "$SKIP_MIGRATE" != "1" ]]; then
  if [[ "$SKIP_BACKUP" != "1" ]]; then
    echo "=== Pre-migration backup (failure stops deploy) ==="
    sudo -n systemctl start nexa-db-backup.service
    sudo -n systemctl is-failed --quiet nexa-db-backup.service && {
      echo "Pre-migration backup failed" >&2
      exit 1
    }
  else
    echo "SKIP_BACKUP=1 — backup skipped (emergency only)"
  fi
  echo "=== Migrations (failure stops deploy) ==="
  bash "$SCRIPT_DIR/emit-obs-event.sh" DEPLOYMENT_MIGRATION_STARTED P3 '{}'
  bash "$SCRIPT_DIR/emit-obs-event.sh" MIGRATION_STARTED P3 '{}'

  IDENTITY_DATABASE_URL="$(get_val "$ENV_FILE" IDENTITY_DATABASE_URL)"
  STAYS_DATABASE_URL="$(get_val "$ENV_FILE" STAYS_DATABASE_URL)"
  export IDENTITY_DATABASE_URL
  export STAYS_DATABASE_URL
  export NEXA_ENV
  NEXA_ENV="$(get_val "$ENV_FILE" NEXA_ENV)"
  export NEXA_ENV

  if [[ -z "${IDENTITY_DATABASE_URL}" || -z "${STAYS_DATABASE_URL}" ]]; then
    echo "IDENTITY_DATABASE_URL and STAYS_DATABASE_URL must be set in $ENV_FILE (values not printed)." >&2
    exit 1
  fi
  if bash "$DATABASE_REPO_PATH/scripts/migrate-remote.sh"; then
    if [[ -x "$DATABASE_REPO_PATH/scripts/verify-migrations.sh" ]] || [[ -f "$DATABASE_REPO_PATH/scripts/verify-migrations.sh" ]]; then
      bash "$DATABASE_REPO_PATH/scripts/verify-migrations.sh" || {
        echo "Migration verify failed after migrate-remote." >&2
        bash "$SCRIPT_DIR/emit-obs-event.sh" MIGRATION_FAILED P1 '{}' || true
        exit 1
      }
    fi
    bash "$SCRIPT_DIR/emit-obs-event.sh" MIGRATION_SUCCEEDED P3 '{}'
    bash "$SCRIPT_DIR/emit-obs-event.sh" DEPLOYMENT_MIGRATION_SUCCEEDED P3 '{}'
  else
    bash "$SCRIPT_DIR/emit-obs-event.sh" MIGRATION_FAILED P1 '{}' || true
    exit 1
  fi
else
  echo "SKIP_MIGRATE=1 — migrations skipped (emergency only)"
fi

bash "$SCRIPT_DIR/emit-obs-event.sh" DEPLOYMENT_STARTED_APPLICATION P3 '{}'
echo "=== Pull immutable release images ==="
docker compose -p "$COMPOSE_PROJECT_NAME" -f docker-compose.release.yml --env-file "$ENV_FILE" pull
docker compose -p "$COMPOSE_PROJECT_NAME" -f docker-compose.release.yml --env-file "$ENV_FILE" up -d

echo "=== Wait for readiness ==="
for _ in $(seq 1 60); do
  id_ok=0
  st_ok=0
  web_ok=0
  dashboard_ok=0
  if curl -fsS "http://127.0.0.1:${IDENTITY_HOST_PORT}/api/v1/health/ready" >/dev/null 2>&1; then
    id_ok=1
  fi
  if curl -fsS "http://127.0.0.1:${STAYS_HOST_PORT}/api/v1/health/ready" >/dev/null 2>&1; then
    st_ok=1
  fi
  if curl -fsS "http://127.0.0.1:${WEB_HOST_PORT:-3005}/en" >/dev/null 2>&1; then
    web_ok=1
  fi
  if curl -fsS "http://127.0.0.1:${DASHBOARD_HOST_PORT:-3010}/" >/dev/null 2>&1; then
    dashboard_ok=1
  fi
  if [[ "$id_ok" == "1" && "$st_ok" == "1" && "$web_ok" == "1" && "$dashboard_ok" == "1" ]]; then
    echo "Ready."
    bash "$SCRIPT_DIR/emit-obs-event.sh" DEPLOYMENT_SUCCEEDED P3 '{}'
    bash "$SCRIPT_DIR/record-deployment.sh" "$ENV_FILE" "success"
    exit 0
  fi
  sleep 5
done

echo "Readiness timeout — recording failure" >&2
bash "$SCRIPT_DIR/emit-obs-event.sh" DEPLOYMENT_HEALTHCHECK_FAILED P1 '{}' || true
bash "$SCRIPT_DIR/record-deployment.sh" "$ENV_FILE" "health_failed" || true
exit 1
