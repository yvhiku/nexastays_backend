#!/usr/bin/env bash
# Local regression for check-env dogfood/staging/production payment policy.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

write_base() {
  local nexa_env="$1"
  local pay="$2"
  cat >"$TMP/.env" <<EOF
NEXA_ENV=${nexa_env}
NODE_ENV=production
IMAGE_TAG=abc123def
IMAGE_REGISTRY=ghcr.io/example
IDENTITY_DATABASE_URL=postgresql://u:p@127.0.0.1:5433/nexa_identity
STAYS_DATABASE_URL=postgresql://u:p@127.0.0.1:5434/nexa_stays
PII_ENCRYPTION_KEY=x
JWT_PRIVATE_KEY=x
JWT_PUBLIC_KEY=x
JWT_ISSUER=https://identity.example/api/v1
JWT_AUDIENCE=nexa-platform
CORS_ORIGINS=https://web.example
INTERNAL_SERVICE_KEY=x
ADMIN_PASSWORD_HASH=x
STAYS_PAYMENT_PROVIDER=${pay}
EOF
  cat >"$TMP/.env.identity" <<'EOF'
DB_HOST=host.docker.internal
DB_PORT=5433
DB_USERNAME=nexa_identity
DB_PASSWORD=secret
DB_NAME=nexa_identity
EOF
  cat >"$TMP/.env.stays" <<'EOF'
DB_HOST=host.docker.internal
DB_PORT=5434
DB_USERNAME=nexa_stays
DB_PASSWORD=secret
DB_NAME=nexa_stays
EOF
}

pass=0
fail=0
assert_ok() {
  if bash "$ROOT/scripts/check-env.sh" "$TMP/.env" "$TMP/.env.identity" "$TMP/.env.stays"; then
    echo "PASS: $1"; pass=$((pass + 1))
  else
    echo "FAIL: $1" >&2; fail=$((fail + 1))
  fi
}
assert_fail() {
  if bash "$ROOT/scripts/check-env.sh" "$TMP/.env" "$TMP/.env.identity" "$TMP/.env.stays"; then
    echo "FAIL: expected failure: $1" >&2; fail=$((fail + 1))
  else
    echo "PASS: $1"; pass=$((pass + 1))
  fi
}

write_base dogfood mock
assert_ok "dogfood+mock allowed"

write_base dogfood cmi
assert_fail "dogfood without mock rejected"

write_base staging mock
assert_ok "staging+mock allowed"

write_base production mock
assert_fail "production+mock rejected"

write_base production cmi
assert_ok "production+non-mock allowed by check-env"

# Collision guard
write_base dogfood mock
cat >"$TMP/.env.stays" <<'EOF'
DB_HOST=host.docker.internal
DB_PORT=5433
DB_USERNAME=nexa_stays
DB_PASSWORD=secret
DB_NAME=nexa_identity
EOF
assert_fail "identical DB_NAME+DB_PORT rejected"

echo "=== check-env unit: pass=$pass fail=$fail ==="
[[ "$fail" -eq 0 ]]
