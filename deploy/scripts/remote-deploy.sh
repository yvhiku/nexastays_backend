#!/usr/bin/env bash
# Host-side deploy sequence: preflight → migrate → compose up → wait healthy.
# Does not print secret env values.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/.env}"
DATABASE_REPO_PATH="${DATABASE_REPO_PATH:?DATABASE_REPO_PATH required}"
IMAGE_TAG="${IMAGE_TAG:?IMAGE_TAG required}"
SKIP_MIGRATE="${SKIP_MIGRATE:-0}"

get_val() {
  local key="$1"
  awk -F= -v k="$key" '
    $0 ~ /^[[:space:]]*#/ { next }
    index($0, k "=") == 1 {
      print substr($0, length(k) + 2)
      exit
    }
  ' "$ENV_FILE"
}

cd "$DEPLOY_DIR"

bash "$SCRIPT_DIR/check-env.sh" "$ENV_FILE"
bash "$SCRIPT_DIR/emit-obs-event.sh" DEPLOYMENT_STARTED P3 '{}'

export IMAGE_TAG
export IMAGE_REGISTRY="$(get_val IMAGE_REGISTRY)"
export BUILD_VERSION="$(get_val BUILD_VERSION)"
export BUILD_TIME="$(get_val BUILD_TIME)"
IDENTITY_HOST_PORT="$(get_val IDENTITY_HOST_PORT)"
STAYS_HOST_PORT="$(get_val STAYS_HOST_PORT)"
IDENTITY_HOST_PORT="${IDENTITY_HOST_PORT:-3001}"
STAYS_HOST_PORT="${STAYS_HOST_PORT:-3002}"

if [[ -z "$IMAGE_REGISTRY" ]]; then
  echo "IMAGE_REGISTRY missing in $ENV_FILE" >&2
  exit 1
fi

if [[ "$IMAGE_TAG" == "latest" ]]; then
  echo "Refusing IMAGE_TAG=latest" >&2
  exit 1
fi

if [[ "$SKIP_MIGRATE" != "1" ]]; then
  echo "=== Migrations (failure stops deploy) ==="
  bash "$SCRIPT_DIR/emit-obs-event.sh" DEPLOYMENT_MIGRATION_STARTED P3 '{}'
  bash "$SCRIPT_DIR/emit-obs-event.sh" MIGRATION_STARTED P3 '{}'
  if [[ -z "${IDENTITY_DATABASE_URL:-}" || -z "${STAYS_DATABASE_URL:-}" ]]; then
    echo "IDENTITY_DATABASE_URL and STAYS_DATABASE_URL must be exported in the deploy shell (not printed)." >&2
    exit 1
  fi
  if bash "$DATABASE_REPO_PATH/scripts/migrate-remote.sh"; then
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
echo "=== Pull + start (${IMAGE_REGISTRY}/*:${IMAGE_TAG}) ==="
docker compose -f docker-compose.release.yml --env-file "$ENV_FILE" pull
docker compose -f docker-compose.release.yml --env-file "$ENV_FILE" up -d

echo "=== Wait for readiness ==="
for _ in $(seq 1 60); do
  id_ok=0
  st_ok=0
  if curl -fsS "http://127.0.0.1:${IDENTITY_HOST_PORT}/api/v1/health/ready" >/dev/null 2>&1; then
    id_ok=1
  fi
  if curl -fsS "http://127.0.0.1:${STAYS_HOST_PORT}/api/v1/health/ready" >/dev/null 2>&1; then
    st_ok=1
  fi
  if [[ "$id_ok" == "1" && "$st_ok" == "1" ]]; then
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
