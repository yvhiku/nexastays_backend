#!/usr/bin/env bash
# Fail-closed soft-launch secrets check. Never prints secret values.
# Usage: bash scripts/assert-dogfood-secrets.sh [deploy_dir]
set -euo pipefail

DEPLOY_DIR="$(cd "${1:-$(dirname "$0")/..}" && pwd)"
SHARED="$DEPLOY_DIR/.env"
IDENTITY="$DEPLOY_DIR/.env.identity"
STAYS="$DEPLOY_DIR/.env.stays"
NOTIF="$DEPLOY_DIR/.env.notifications"
MEDIA="$DEPLOY_DIR/.env.media"

get_val() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || return 0
  awk -F= -v k="$key" '
    $0 ~ /^[[:space:]]*#/ { next }
    index($0, k "=") == 1 {
      v = substr($0, length(k) + 2)
      gsub(/\r/, "", v)
      print v
      exit
    }
  ' "$file"
}

req_file() {
  [[ -f "$1" ]] || { echo "FAIL: missing $1" >&2; exit 1; }
}

req_nonempty() {
  local file="$1" key="$2"
  local v
  v="$(get_val "$file" "$key")"
  if [[ -z "$v" || "$v" == REPLACE* || "$v" == *REPLACE* ]]; then
    echo "FAIL: $key missing or still a REPLACE placeholder in $(basename "$file")" >&2
    exit 1
  fi
  echo "OK: $key set ($(basename "$file"))"
}

req_file "$SHARED"
req_file "$IDENTITY"
req_file "$STAYS"
req_file "$NOTIF"
req_file "$MEDIA"

req_nonempty "$SHARED" NEXA_ENV
req_nonempty "$SHARED" PII_ENCRYPTION_KEY
req_nonempty "$SHARED" INTERNAL_SERVICE_KEY
req_nonempty "$SHARED" REDIS_URL
req_nonempty "$SHARED" AUTH_COOKIE_DOMAIN
req_nonempty "$SHARED" NOTIFICATIONS_SERVICE_URL
req_nonempty "$SHARED" CORS_ORIGINS
req_nonempty "$SHARED" JWT_PRIVATE_KEY
req_nonempty "$SHARED" JWT_PUBLIC_KEY
req_nonempty "$SHARED" STAYS_PUBLIC_URL
req_nonempty "$SHARED" MESSAGING_MEDIA_SECRET
req_nonempty "$IDENTITY" DB_PASSWORD
req_nonempty "$STAYS" DB_PASSWORD
req_nonempty "$NOTIF" INTERNAL_SERVICE_KEY
req_nonempty "$NOTIF" REDIS_URL
req_nonempty "$MEDIA" INTERNAL_SERVICE_KEY
req_nonempty "$MEDIA" MEDIA_SIGNING_SECRET

nexa_env="$(get_val "$SHARED" NEXA_ENV)"
if [[ "$nexa_env" != "dogfood" && "$nexa_env" != "staging" ]]; then
  echo "FAIL: assert-dogfood-secrets expects NEXA_ENV=dogfood|staging (got ${nexa_env:-empty})" >&2
  exit 1
fi

# Sumsub sandbox/live: webhook secret required when mode or token is set
sumsub_mode="$(get_val "$SHARED" SUMSUB_MODE)"
[[ -z "$sumsub_mode" ]] && sumsub_mode="$(get_val "$IDENTITY" SUMSUB_MODE)"
sumsub_token="$(get_val "$SHARED" SUMSUB_APP_TOKEN)"
[[ -z "$sumsub_token" ]] && sumsub_token="$(get_val "$IDENTITY" SUMSUB_APP_TOKEN)"
if [[ -n "$sumsub_mode" || -n "$sumsub_token" ]]; then
  wh="$(get_val "$SHARED" SUMSUB_WEBHOOK_SECRET)"
  [[ -z "$wh" ]] && wh="$(get_val "$IDENTITY" SUMSUB_WEBHOOK_SECRET)"
  if [[ -z "$wh" || "$wh" == REPLACE* ]]; then
    echo "FAIL: SUMSUB_WEBHOOK_SECRET required when Sumsub is configured" >&2
    exit 1
  fi
  echo "OK: SUMSUB_WEBHOOK_SECRET set"
fi

# FCM soft-launch: PUSH_DISABLED=true OR FCM credentials present
push_disabled="$(get_val "$SHARED" PUSH_DISABLED)"
[[ -z "$push_disabled" ]] && push_disabled="$(get_val "$NOTIF" PUSH_DISABLED)"
fcm_json="$(get_val "$NOTIF" FCM_SERVICE_ACCOUNT_JSON)"
fcm_path="$(get_val "$NOTIF" FCM_SERVICE_ACCOUNT_PATH)"
if [[ "${push_disabled}" == "true" ]]; then
  echo "OK: PUSH_DISABLED=true (FCM deferred for soft-launch)"
elif [[ -n "$fcm_json" || -n "$fcm_path" ]]; then
  echo "OK: FCM credentials configured"
else
  echo "FAIL: set PUSH_DISABLED=true or provide FCM_SERVICE_ACCOUNT_JSON/PATH" >&2
  exit 1
fi

echo "=== Dogfood secrets assert passed ==="
