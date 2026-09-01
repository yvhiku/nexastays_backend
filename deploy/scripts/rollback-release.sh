#!/usr/bin/env bash
# Roll back application containers to the last recorded immutable image tags.
# Database schemas are never downgraded automatically.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/.env}"
PREVIOUS_RELEASE_FILE="${PREVIOUS_RELEASE_FILE:-$DEPLOY_DIR/.release.previous.env}"

[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE" >&2; exit 1; }
[[ -f "$PREVIOUS_RELEASE_FILE" ]] || { echo "No recorded previous release" >&2; exit 1; }

get_val() {
  local file="$1" key="$2"
  awk -F= -v k="$key" '$0 !~ /^[[:space:]]*#/ && index($0,k "=")==1 {print substr($0,length(k)+2); exit}' "$file"
}

set_env_tag() {
  local key="$1" value="$2"
  sed -i.bak "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
}

BACKEND_IMAGE_TAG="$(get_val "$PREVIOUS_RELEASE_FILE" BACKEND_IMAGE_TAG)"
WEB_IMAGE_TAG="$(get_val "$PREVIOUS_RELEASE_FILE" WEB_IMAGE_TAG)"
DASHBOARD_IMAGE_TAG="$(get_val "$PREVIOUS_RELEASE_FILE" DASHBOARD_IMAGE_TAG)"

for release_tag in "$BACKEND_IMAGE_TAG" "$WEB_IMAGE_TAG" "$DASHBOARD_IMAGE_TAG"; do
  echo "$release_tag" | grep -qE '^[0-9a-f]{7,64}$' || {
    echo "Previous release file contains an invalid tag" >&2
    exit 1
  }
done

set_env_tag BACKEND_IMAGE_TAG "$BACKEND_IMAGE_TAG"
set_env_tag WEB_IMAGE_TAG "$WEB_IMAGE_TAG"
set_env_tag DASHBOARD_IMAGE_TAG "$DASHBOARD_IMAGE_TAG"
chmod 600 "$ENV_FILE" "${ENV_FILE}.bak" 2>/dev/null || true

export BACKEND_IMAGE_TAG WEB_IMAGE_TAG DASHBOARD_IMAGE_TAG
export IMAGE_REGISTRY
IMAGE_REGISTRY="$(get_val "$ENV_FILE" IMAGE_REGISTRY)"

echo "Rolling application containers back to recorded immutable tags."
echo "Database migrations are intentionally not reversed."
docker compose -f "$DEPLOY_DIR/docker-compose.release.yml" --env-file "$ENV_FILE" pull
docker compose -f "$DEPLOY_DIR/docker-compose.release.yml" --env-file "$ENV_FILE" up -d

for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3001/api/v1/health/ready >/dev/null 2>&1 \
    && curl -fsS http://127.0.0.1:3002/api/v1/health/ready >/dev/null 2>&1 \
    && curl -fsS http://127.0.0.1:3005/en >/dev/null 2>&1 \
    && curl -fsS http://127.0.0.1:3010/ >/dev/null 2>&1; then
    echo "Rollback healthy."
    exit 0
  fi
  sleep 5
done

echo "Rollback containers did not become healthy in time" >&2
exit 1
