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
      v = substr($0, length(k) + 2)
      gsub(/\r/, "", v)
      print v
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
req "$SHARED_ENV" BACKEND_IMAGE_TAG
req "$SHARED_ENV" WEB_IMAGE_TAG
req "$SHARED_ENV" DASHBOARD_IMAGE_TAG
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
req "$SHARED_ENV" REDIS_URL
req "$SHARED_ENV" AUTH_COOKIE_DOMAIN
req "$SHARED_ENV" NOTIFICATIONS_SERVICE_URL

for f in "$IDENTITY_ENV" "$STAYS_ENV"; do
  req "$f" DB_HOST
  req "$f" DB_PORT
  req "$f" DB_USERNAME
  req "$f" DB_PASSWORD
  req "$f" DB_NAME
done

NEXA_ENV="$(get_val "$SHARED_ENV" NEXA_ENV)"
NODE_ENV="$(get_val "$SHARED_ENV" NODE_ENV)"
BACKEND_IMAGE_TAG="$(get_val "$SHARED_ENV" BACKEND_IMAGE_TAG)"
WEB_IMAGE_TAG="$(get_val "$SHARED_ENV" WEB_IMAGE_TAG)"
DASHBOARD_IMAGE_TAG="$(get_val "$SHARED_ENV" DASHBOARD_IMAGE_TAG)"
STAYS_PAYMENT_PROVIDER="$(get_val "$SHARED_ENV" STAYS_PAYMENT_PROVIDER)"
ID_DB="$(get_val "$IDENTITY_ENV" DB_NAME)"
ST_DB="$(get_val "$STAYS_ENV" DB_NAME)"
ID_PORT="$(get_val "$IDENTITY_ENV" DB_PORT)"
ST_PORT="$(get_val "$STAYS_ENV" DB_PORT)"

if [[ "${NODE_ENV}" != "production" ]]; then
  echo "WARN: NODE_ENV=${NODE_ENV} (expected production on deploy hosts)" >&2
fi

for release_tag in "$BACKEND_IMAGE_TAG" "$WEB_IMAGE_TAG" "$DASHBOARD_IMAGE_TAG"; do
  if [[ "$release_tag" == "latest" ]]; then
    echo "FAIL: latest is not an allowed release identity" >&2
    exit 1
  fi
  if ! echo "$release_tag" | grep -qE '^[0-9a-f]{7,64}$'; then
    echo "FAIL: release image tags must be immutable Git SHAs" >&2
    exit 1
  fi
done

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
  if [[ "${STAYS_PAYMENT_PROVIDER}" != "cmi" ]]; then
    echo "FAIL: NEXA_ENV=production requires STAYS_PAYMENT_PROVIDER=cmi (got '${STAYS_PAYMENT_PROVIDER:-<empty>}')" >&2
    exit 1
  fi

  SUMSUB_MODE="$(get_val "$SHARED_ENV" SUMSUB_MODE)"
  if [[ -z "${SUMSUB_MODE}" ]] && has_key "$IDENTITY_ENV" SUMSUB_MODE; then
    SUMSUB_MODE="$(get_val "$IDENTITY_ENV" SUMSUB_MODE)"
  fi
  if [[ "${SUMSUB_MODE}" != "live" ]]; then
    echo "FAIL: NEXA_ENV=production requires SUMSUB_MODE=live (got '${SUMSUB_MODE:-<empty>}')" >&2
    exit 1
  fi

  EMI_PROVIDER_TYPE="$(get_val "$SHARED_ENV" EMI_PROVIDER_TYPE)"
  if [[ -z "${EMI_PROVIDER_TYPE}" ]] && has_key "$IDENTITY_ENV" EMI_PROVIDER_TYPE; then
    EMI_PROVIDER_TYPE="$(get_val "$IDENTITY_ENV" EMI_PROVIDER_TYPE)"
  fi
  if [[ -z "${EMI_PROVIDER_TYPE}" ]]; then
    echo "FAIL: NEXA_ENV=production requires EMI_PROVIDER_TYPE explicitly set (or disabled)" >&2
    exit 1
  fi
  if [[ "${EMI_PROVIDER_TYPE}" == "mock" ]]; then
    echo "FAIL: EMI_PROVIDER_TYPE=mock forbidden when NEXA_ENV=production" >&2
    exit 1
  fi

  req "$SHARED_ENV" ERROR_MONITORING_DSN
  req "$SHARED_ENV" OPS_ALERT_WEBHOOK_URL
  req "$SHARED_ENV" MEDIA_SERVICE_URL
fi

if [[ "${NEXA_ENV}" == "staging" || "${NEXA_ENV}" == "dogfood" ]]; then
  if [[ "${STAYS_PAYMENT_PROVIDER}" != "mock" ]]; then
    echo "FAIL: ${NEXA_ENV} requires STAYS_PAYMENT_PROVIDER=mock explicitly (got '${STAYS_PAYMENT_PROVIDER:-<empty>}')" >&2
    exit 1
  fi
fi

# Demo OTP is allowed only for the explicit dogfood environment.
demo_otp=""
if has_key "$SHARED_ENV" DEMO_OTP_CODE; then
  demo_otp="$(get_val "$SHARED_ENV" DEMO_OTP_CODE)"
fi
if [[ -z "$demo_otp" ]] && has_key "$IDENTITY_ENV" DEMO_OTP_CODE; then
  demo_otp="$(get_val "$IDENTITY_ENV" DEMO_OTP_CODE)"
fi
if [[ -n "${demo_otp}" ]]; then
  if ! echo "$demo_otp" | grep -qE '^[0-9]{6}$'; then
    echo "FAIL: DEMO_OTP_CODE must contain exactly 6 digits" >&2
    exit 1
  fi
  if [[ "${NEXA_ENV}" != "dogfood" ]]; then
    echo "FAIL: DEMO_OTP_CODE is allowed only when NEXA_ENV=dogfood" >&2
    exit 1
  fi
fi
echo "OK: DEMO_OTP_CODE policy"

# Redis must not be loopback-only string empty; reject obvious missing host
REDIS_URL="$(get_val "$SHARED_ENV" REDIS_URL)"
if echo "$REDIS_URL" | grep -qiE '^(redis://)?$'; then
  echo "FAIL: REDIS_URL is empty" >&2
  exit 1
fi
echo "OK: REDIS_URL is set"

AUTH_COOKIE_DOMAIN="$(get_val "$SHARED_ENV" AUTH_COOKIE_DOMAIN)"
if [[ "${AUTH_COOKIE_DOMAIN}" != .* ]]; then
  echo "FAIL: AUTH_COOKIE_DOMAIN must start with a leading dot (e.g. .nexastays.ma)" >&2
  exit 1
fi
if echo "$AUTH_COOKIE_DOMAIN" | grep -qiE 'localhost|127\.0\.0\.1'; then
  echo "FAIL: AUTH_COOKIE_DOMAIN must not use loopback" >&2
  exit 1
fi
echo "OK: AUTH_COOKIE_DOMAIN is set"

# Sumsub webhook secret required whenever Sumsub is configured (sandbox or live)
sumsub_token=""
if has_key "$SHARED_ENV" SUMSUB_APP_TOKEN; then
  sumsub_token="$(get_val "$SHARED_ENV" SUMSUB_APP_TOKEN)"
fi
if [[ -z "$sumsub_token" ]] && has_key "$IDENTITY_ENV" SUMSUB_APP_TOKEN; then
  sumsub_token="$(get_val "$IDENTITY_ENV" SUMSUB_APP_TOKEN)"
fi
sumsub_mode=""
if has_key "$SHARED_ENV" SUMSUB_MODE; then
  sumsub_mode="$(get_val "$SHARED_ENV" SUMSUB_MODE)"
fi
if [[ -z "$sumsub_mode" ]] && has_key "$IDENTITY_ENV" SUMSUB_MODE; then
  sumsub_mode="$(get_val "$IDENTITY_ENV" SUMSUB_MODE)"
fi
if [[ -n "$sumsub_token" || -n "$sumsub_mode" ]]; then
  webhook_secret=""
  if has_key "$SHARED_ENV" SUMSUB_WEBHOOK_SECRET; then
    webhook_secret="$(get_val "$SHARED_ENV" SUMSUB_WEBHOOK_SECRET)"
  fi
  if [[ -z "$webhook_secret" ]] && has_key "$IDENTITY_ENV" SUMSUB_WEBHOOK_SECRET; then
    webhook_secret="$(get_val "$IDENTITY_ENV" SUMSUB_WEBHOOK_SECRET)"
  fi
  if [[ -z "$webhook_secret" ]]; then
    echo "FAIL: SUMSUB_WEBHOOK_SECRET is required when Sumsub is configured (sandbox or live). Register https://identity.<host>/api/v1/kyc/sumsub/webhook" >&2
    exit 1
  fi
  echo "OK: SUMSUB_WEBHOOK_SECRET is set"
fi

# Phase 1 — SMS provider: EnvoiSMS (preferred) or Twilio
if [[ "${NODE_ENV}" == "production" && -z "${demo_otp}" ]]; then
  if has_key "$SHARED_ENV" TWILIO_FROM_NUMBER; then
    echo "FAIL: TWILIO_FROM_NUMBER is not a runtime variable; use TWILIO_PHONE_NUMBER only" >&2
    exit 1
  fi
  if has_key "$SHARED_ENV" ENVOISMS_API_KEY; then
    envoi_key="$(get_val "$SHARED_ENV" ENVOISMS_API_KEY)"
  else
    envoi_key=""
  fi
  if [[ -n "${envoi_key}" ]]; then
    echo "OK: ENVOISMS_API_KEY set (SMS provider)"
  else
    req "$SHARED_ENV" TWILIO_ACCOUNT_SID
    req "$SHARED_ENV" TWILIO_AUTH_TOKEN
    req "$SHARED_ENV" TWILIO_PHONE_NUMBER
    echo "OK: Twilio SMS provider configured"
  fi
fi

# Phase 1 — credentialed CORS must not use wildcard
CORS_ORIGINS="$(get_val "$SHARED_ENV" CORS_ORIGINS)"
if echo "$CORS_ORIGINS" | grep -qE '(^|,)[[:space:]]*\*[[:space:]]*(,|$)'; then
  echo "FAIL: CORS_ORIGINS must not contain wildcard * when credentials are enabled" >&2
  exit 1
fi
echo "OK: CORS_ORIGINS has no wildcard"

# Phase 1 — JWT issuer must not be loopback on deploy hosts
JWT_ISSUER="$(get_val "$SHARED_ENV" JWT_ISSUER)"
if echo "$JWT_ISSUER" | grep -qiE 'localhost|127\.0\.0\.1|::1'; then
  echo "FAIL: JWT_ISSUER must not use a loopback host on deploy hosts" >&2
  exit 1
fi
echo "OK: JWT_ISSUER is non-loopback"

# B6 — reject known-dev / placeholder DB credentials outside development (never print values)
is_weak_secret() {
  local v="$1"
  [[ -z "$v" ]] && return 0
  echo "$v" | grep -qE 'nexa_identity_dev|nexa_stays_dev|CHANGE_ME|REPLACE_STRONG_PASSWORD|^REPLACE$|^dev$|dev-internal-key' && return 0
  [[ "${#v}" -lt 12 ]] && return 0
  return 1
}

ID_PW="$(get_val "$IDENTITY_ENV" DB_PASSWORD)"
ST_PW="$(get_val "$STAYS_ENV" DB_PASSWORD)"
ID_URL="$(get_val "$SHARED_ENV" IDENTITY_DATABASE_URL)"
ST_URL="$(get_val "$SHARED_ENV" STAYS_DATABASE_URL)"
INTERNAL_KEY="$(get_val "$SHARED_ENV" INTERNAL_SERVICE_KEY)"

if is_weak_secret "$ID_PW" || is_weak_secret "$ST_PW"; then
  echo "FAIL: weak/default DB_PASSWORD rejected for NEXA_ENV=${NEXA_ENV} (value not printed)" >&2
  exit 1
fi
if is_weak_secret "$INTERNAL_KEY"; then
  echo "FAIL: weak/default INTERNAL_SERVICE_KEY rejected for NEXA_ENV=${NEXA_ENV} (value not printed)" >&2
  exit 1
fi
if echo "$ID_URL$ST_URL" | grep -qE 'nexa_identity_dev|nexa_stays_dev|CHANGE_ME|REPLACE_STRONG_PASSWORD'; then
  echo "FAIL: migrate DATABASE_URL contains placeholder or known-dev password (value not printed)" >&2
  exit 1
fi
echo "OK: DB credentials reject known-dev defaults"

# B8 — require restrictive permissions on secret env files
assert_mode_600() {
  local f="$1"
  if ! command -v chmod >/dev/null 2>&1; then
    echo "FAIL: chmod unavailable; deploy hosts must be Unix" >&2
    exit 1
  fi
  local mode
  mode="$(stat -c '%a' "$f" 2>/dev/null || stat -f '%OLp' "$f" 2>/dev/null || echo '')"
  if [[ -z "$mode" ]]; then
    echo "WARN: could not read mode for $(basename "$f")" >&2
    return 0
  fi
  if [[ "$mode" != "600" && "$mode" != "400" && "$mode" != "0600" && "$mode" != "0400" ]]; then
    echo "FAIL: $(basename "$f") mode is $mode (require 600 or 400). Run: bash scripts/secure-env-perms.sh ..." >&2
    exit 1
  fi
  echo "OK: $(basename "$f") permissions restrictive ($mode)"
}
assert_mode_600 "$SHARED_ENV"
assert_mode_600 "$IDENTITY_ENV"
assert_mode_600 "$STAYS_ENV"

echo "=== Preflight passed ==="
