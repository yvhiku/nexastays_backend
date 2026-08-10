#!/usr/bin/env bash
# Fail-closed env preflight. Never prints secret values.
# Does not `source` the file (PEM keys may be multiline).
set -euo pipefail

ENV_FILE="${1:-.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

get_val() {
  local key="$1"
  # First non-comment line KEY=... (does not support multiline PEM via this helper)
  awk -F= -v k="$key" '
    $0 ~ /^[[:space:]]*#/ { next }
    index($0, k "=") == 1 {
      print substr($0, length(k) + 2)
      exit
    }
  ' "$ENV_FILE"
}

has_key() {
  local key="$1"
  grep -qE "^[[:space:]]*${key}=" "$ENV_FILE"
}

req() {
  local name="$1"
  if ! has_key "$name"; then
    echo "FAIL: required variable missing: $name" >&2
    exit 1
  fi
  local v
  v="$(get_val "$name")"
  if [[ -z "$v" ]]; then
    echo "FAIL: required variable empty: $name" >&2
    exit 1
  fi
  echo "OK: $name is set"
}

echo "=== Preflight (names only; values redacted) ==="
req NEXA_ENV
req NODE_ENV
req IMAGE_TAG
req IMAGE_REGISTRY
req DB_PASSWORD
req PII_ENCRYPTION_KEY
req JWT_PRIVATE_KEY
req JWT_PUBLIC_KEY
req JWT_ISSUER
req JWT_AUDIENCE
req CORS_ORIGINS
req INTERNAL_SERVICE_KEY
req ADMIN_PASSWORD_HASH

NEXA_ENV="$(get_val NEXA_ENV)"
NODE_ENV="$(get_val NODE_ENV)"
IMAGE_TAG="$(get_val IMAGE_TAG)"
STAYS_PAYMENT_PROVIDER="$(get_val STAYS_PAYMENT_PROVIDER || true)"

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

if [[ "${NEXA_ENV}" == "production" ]]; then
  if [[ "${STAYS_PAYMENT_PROVIDER}" == "mock" ]]; then
    echo "FAIL: mock payments forbidden when NEXA_ENV=production (use dogfood)" >&2
    exit 1
  fi
fi

if [[ "${NEXA_ENV}" == "staging" ]]; then
  if [[ "${STAYS_PAYMENT_PROVIDER}" != "mock" ]]; then
    echo "FAIL: staging soft-launch requires STAYS_PAYMENT_PROVIDER=mock explicitly (got '${STAYS_PAYMENT_PROVIDER:-<empty>}')" >&2
    exit 1
  fi
fi

echo "=== Preflight passed ==="
