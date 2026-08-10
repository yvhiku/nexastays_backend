#!/usr/bin/env bash
# Fail-closed env preflight for VPS / SSH deploy hosts.
# Never prints secret values. Does not source PEM multiline keys as shell.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SHARED_ENV="${1:-$DEPLOY_DIR/.env}"
IDENTITY_ENV="${2:-$DEPLOY_DIR/.env.identity}"
STAYS_ENV="${3:-$DEPLOY_DIR/.env.stays}"

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

has_key() {
  local file="$1"
  local key="$2"
  grep -qE "^[[:space:]]*${key}=" "$file"
}

req_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "FAIL: missing env file: $file" >&2
    exit 1
  fi
}

req() {
  local file="$1"
  local name="$2"
  if ! has_key "$file" "$name"; then
    echo "FAIL: required variable missing: $name (in $(basename "$file"))" >&2
    exit 1
  fi
  local v
  v="$(get_val "$file" "$name")"
  if [[ -z "$v" ]]; then
    echo "FAIL: required variable empty: $name (in $(basename "$file"))" >&2
    exit 1
  fi
  echo "OK: $name is set ($(basename "$file"))"
}

echo "=== Preflight (names only; values redacted) ==="
req_file "$SHARED_ENV"
req_file "$IDENTITY_ENV"
req_file "$STAYS_ENV"

req "$SHARED_ENV" NEXA_ENV
req "$SHARED_ENV" NODE_ENV
req "$SHARED_ENV" IMAGE_TAG
req "$SHARED_ENV" IMAGE_REGISTRY
req "$SHARED_ENV" IDENTITY_DATABASE_URL
req "$SHARED_ENV" STAYS_DATABASE_URL
req "$SHARED_ENV" PII_ENCRYPTION_KEY
req "$SHARED_ENV" JWT_PRIVATE_KEY
req "$SHARED_ENV" JWT_PUBLIC_KEY
req "$SHARED_ENV" JWT_ISSUER
req "$SHARED_ENV" JWT_AUDIENCE
req "$SHARED_ENV" CORS_ORIGINS
req "$SHARED_ENV" INTERNAL_SERVICE_KEY
req "$SHARED_ENV" ADMIN_PASSWORD_HASH
req "$SHARED_ENV" STAYS_PAYMENT_PROVIDER

for f in "$IDENTITY_ENV" "$STAYS_ENV"; do
  req "$f" DB_HOST
  req "$f" DB_PORT
  req "$f" DB_USERNAME
  req "$f" DB_PASSWORD
  req "$f" DB_NAME
done

NEXA_ENV="$(get_val "$SHARED_ENV" NEXA_ENV)"
NODE_ENV="$(get_val "$SHARED_ENV" NODE_ENV)"
IMAGE_TAG="$(get_val "$SHARED_ENV" IMAGE_TAG)"
STAYS_PAYMENT_PROVIDER="$(get_val "$SHARED_ENV" STAYS_PAYMENT_PROVIDER)"
ID_DB="$(get_val "$IDENTITY_ENV" DB_NAME)"
ST_DB="$(get_val "$STAYS_ENV" DB_NAME)"
ID_PORT="$(get_val "$IDENTITY_ENV" DB_PORT)"
ST_PORT="$(get_val "$STAYS_ENV" DB_PORT)"

if [[ "${NODE_ENV}" != "production" ]]; then
  echo "WARN: NODE_ENV=${NODE_ENV} (expected production on deploy hosts)" >&2
fi

if [[ "${IMAGE_TAG}" == "latest" ]]; then
  echo "FAIL: IMAGE_TAG=latest is not an allowed release identity" >&2
  exit 1
fi

case "${NEXA_ENV}" in
  dogfood|staging|production) ;;
  *)
    echo "FAIL: NEXA_ENV must be dogfood|staging|production (got ${NEXA_ENV})" >&2
    exit 1
    ;;
esac

if [[ "${ID_DB}" == "${ST_DB}" && "${ID_PORT}" == "${ST_PORT}" ]]; then
  echo "FAIL: Identity and Stays DB_NAME/DB_PORT must not be identical (shared DB collision)" >&2
  exit 1
fi

if [[ "${NEXA_ENV}" == "production" ]]; then
  if [[ "${STAYS_PAYMENT_PROVIDER}" == "mock" ]]; then
    echo "FAIL: mock payments forbidden when NEXA_ENV=production (use dogfood)" >&2
    exit 1
  fi
fi

if [[ "${NEXA_ENV}" == "staging" || "${NEXA_ENV}" == "dogfood" ]]; then
  if [[ "${STAYS_PAYMENT_PROVIDER}" != "mock" ]]; then
    echo "FAIL: ${NEXA_ENV} requires STAYS_PAYMENT_PROVIDER=mock explicitly (got '${STAYS_PAYMENT_PROVIDER:-<empty>}')" >&2
    exit 1
  fi
fi

echo "=== Preflight passed ==="
