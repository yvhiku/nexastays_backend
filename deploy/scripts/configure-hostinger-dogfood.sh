#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB_DIR="${DB_DIR:-/opt/nexa/nexastays_db}"
SHARED="$DEPLOY_DIR/.env"
IDENTITY="$DEPLOY_DIR/.env.identity"
STAYS="$DEPLOY_DIR/.env.stays"
NOTIF="$DEPLOY_DIR/.env.notifications"
MEDIA="$DEPLOY_DIR/.env.media"

for file in "$SHARED" "$IDENTITY" "$STAYS"; do
  [[ -f "$file" ]] || { echo "Missing $file" >&2; exit 1; }
done

if [[ ! -f "$NOTIF" ]]; then
  if [[ -f "$DEPLOY_DIR/env/dogfood.notifications.env.example" ]]; then
    cp "$DEPLOY_DIR/env/dogfood.notifications.env.example" "$NOTIF"
  else
    printf '%s\n' "PORT=3003" "NODE_ENV=production" > "$NOTIF"
  fi
fi
if [[ ! -f "$MEDIA" ]]; then
  if [[ -f "$DEPLOY_DIR/env/dogfood.media.env.example" ]]; then
    cp "$DEPLOY_DIR/env/dogfood.media.env.example" "$MEDIA"
  else
    printf '%s\n' "PORT=3004" "NODE_ENV=production" "NEXA_ENV=dogfood" > "$MEDIA"
  fi
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="$DEPLOY_DIR/.env-backups/$stamp"
mkdir -p "$backup_dir"
cp "$SHARED" "$IDENTITY" "$STAYS" "$NOTIF" "$MEDIA" "$backup_dir/"
chmod 700 "$DEPLOY_DIR/.env-backups" "$backup_dir"
chmod 600 "$backup_dir"/.env*

random_hex() { openssl rand -hex "$1"; }
identity_password="$(random_hex 24)"
stays_password="$(random_hex 24)"
internal_key="$(random_hex 32)"
media_signing="$(random_hex 32)"
pii_key="$(openssl rand -base64 32 | tr -d '\n')"
private_pem="$(openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 2>/dev/null)"
public_pem="$(printf '%s\n' "$private_pem" | openssl pkey -pubout 2>/dev/null)"
private_escaped="$(printf '%s\n' "$private_pem" | awk 'BEGIN{ORS=""} {if (NR>1) printf "\\n"; printf "%s", $0}')"
public_escaped="$(printf '%s\n' "$public_pem" | awk 'BEGIN{ORS=""} {if (NR>1) printf "\\n"; printf "%s", $0}')"

set_key() {
  local file="$1" key="$2" value="$3" tmp
  tmp="$(mktemp)"
  NEXA_ENV_VALUE="$value" awk -v key="$key" '
    BEGIN { done=0 }
    index($0, key "=") == 1 { print key "=" ENVIRON["NEXA_ENV_VALUE"]; done=1; next }
    { print }
    END { if (!done) print key "=" ENVIRON["NEXA_ENV_VALUE"] }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
}

release_tag="$(git -C /opt/nexa/nexastays_backend rev-parse --short=12 HEAD 2>/dev/null || echo localdev)"
set_key "$SHARED" NEXA_ENV dogfood
set_key "$SHARED" NODE_ENV production
set_key "$SHARED" IMAGE_REGISTRY local
set_key "$SHARED" BACKEND_IMAGE_TAG "$release_tag"
set_key "$SHARED" WEB_IMAGE_TAG "${WEB_IMAGE_TAG:-$release_tag}"
set_key "$SHARED" DASHBOARD_IMAGE_TAG "${DASHBOARD_IMAGE_TAG:-$release_tag}"
set_key "$SHARED" PLATFORM_IMAGE_TAG "$release_tag"
set_key "$SHARED" IDENTITY_DATABASE_URL "postgresql://nexa_identity:${identity_password}@127.0.0.1:5433/nexa_identity"
set_key "$SHARED" STAYS_DATABASE_URL "postgresql://nexa_stays:${stays_password}@127.0.0.1:5434/nexa_stays"
set_key "$SHARED" PII_ENCRYPTION_KEY "$pii_key"
set_key "$SHARED" JWT_PRIVATE_KEY "$private_escaped"
set_key "$SHARED" JWT_PUBLIC_KEY "$public_escaped"
set_key "$SHARED" JWT_ISSUER "https://identity.nexastays.ma/api/v1"
set_key "$SHARED" JWT_AUDIENCE nexa-platform
set_key "$SHARED" REFRESH_TOKEN_PEPPER "$(random_hex 32)"
set_key "$SHARED" OTP_PEPPER "$(random_hex 32)"
set_key "$SHARED" KYC_HASH_PEPPER "$(random_hex 32)"
set_key "$SHARED" INTERNAL_SERVICE_KEY "$internal_key"
set_key "$SHARED" MESSAGING_MEDIA_SECRET "$(random_hex 32)"
set_key "$SHARED" QR_NFC_HMAC_SECRET "$(random_hex 32)"
set_key "$SHARED" CORS_ORIGINS "https://nexastays.ma,https://admin.nexastays.ma"
set_key "$SHARED" AUTH_COOKIE_DOMAIN ".nexastays.ma"
set_key "$SHARED" IDENTITY_BASE_URL "https://identity.nexastays.ma/api/v1"
set_key "$SHARED" IDENTITY_JWKS_URL "https://identity.nexastays.ma/api/v1/.well-known/jwks.json"
set_key "$SHARED" STAYS_PUBLIC_URL "https://api.nexastays.ma"
set_key "$SHARED" STAYS_WEB_URL "https://nexastays.ma"
set_key "$SHARED" STAYS_PAYMENT_PROVIDER mock
set_key "$SHARED" DEMO_OTP_CODE 123456
set_key "$SHARED" REDIS_URL "redis://redis:6379"
set_key "$SHARED" DB_SSL true
set_key "$SHARED" DB_SSL_REJECT_UNAUTHORIZED false
set_key "$SHARED" NOTIFICATIONS_SERVICE_URL "http://notifications:3003"
set_key "$SHARED" MEDIA_SERVICE_URL "http://media:3004"
set_key "$SHARED" PUSH_DISABLED true
set_key "$SHARED" SUMSUB_MODE sandbox

set_key "$IDENTITY" DB_HOST identity-db
set_key "$IDENTITY" DB_PORT 5432
set_key "$IDENTITY" DB_USERNAME nexa_identity
set_key "$IDENTITY" DB_PASSWORD "$identity_password"
set_key "$IDENTITY" DB_NAME nexa_identity

set_key "$STAYS" DB_HOST stays-db
set_key "$STAYS" DB_PORT 5432
set_key "$STAYS" DB_USERNAME nexa_stays
set_key "$STAYS" DB_PASSWORD "$stays_password"
set_key "$STAYS" DB_NAME nexa_stays
set_key "$STAYS" STAYS_PAYMENT_PROVIDER mock

set_key "$NOTIF" PORT 3003
set_key "$NOTIF" NODE_ENV production
set_key "$NOTIF" DB_HOST identity-db
set_key "$NOTIF" DB_PORT 5432
set_key "$NOTIF" DB_USERNAME nexa_identity
set_key "$NOTIF" DB_PASSWORD "$identity_password"
set_key "$NOTIF" DB_NAME nexa_identity
set_key "$NOTIF" REDIS_URL "redis://redis:6379"
set_key "$NOTIF" INTERNAL_SERVICE_KEY "$internal_key"
set_key "$NOTIF" PUSH_DISABLED true

set_key "$MEDIA" PORT 3004
set_key "$MEDIA" NODE_ENV production
set_key "$MEDIA" NEXA_ENV dogfood
set_key "$MEDIA" MEDIA_STORAGE_BACKEND local
set_key "$MEDIA" MEDIA_STORAGE_ROOT /data/nexa-media
set_key "$MEDIA" INTERNAL_SERVICE_KEY "$internal_key"
set_key "$MEDIA" MEDIA_SIGNING_SECRET "$media_signing"

mkdir -p "$DB_DIR"
cat > "$DB_DIR/.env.db" <<EOF
IDENTITY_DB_PASSWORD=$identity_password
STAYS_DB_PASSWORD=$stays_password
EOF

chmod 600 "$SHARED" "$IDENTITY" "$STAYS" "$NOTIF" "$MEDIA" "$DB_DIR/.env.db"
echo "Configured dogfood environment. Backup: $backup_dir"
echo "NOTE: set SUMSUB_WEBHOOK_SECRET manually to the Sumsub console webhook secret."
echo "Then: bash scripts/assert-dogfood-secrets.sh && bash scripts/check-env.sh"
