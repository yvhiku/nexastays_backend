#!/usr/bin/env bash
# Post-deploy smoke tests (PROD-OPS-002). No real-money payments.
set -euo pipefail

IDENTITY_BASE="${SMOKE_IDENTITY_BASE_URL:?}"
STAYS_BASE="${SMOKE_STAYS_BASE_URL:?}"
CORS_OK="${SMOKE_CORS_ORIGIN_OK:-}"
CORS_BAD="${SMOKE_CORS_ORIGIN_BAD:-https://evil.example}"
EXPECT_NEXA_ENV="${SMOKE_EXPECT_NEXA_ENV:-}"
EXPECT_SWAGGER="${SMOKE_EXPECT_SWAGGER:-false}"

pass=0
fail=0

ok() {
  echo "PASS: $1"
  pass=$((pass + 1))
}
bad() {
  echo "FAIL: $1" >&2
  fail=$((fail + 1))
}

code() {
  curl -sS -o /dev/null -w '%{http_code}' "$@" || echo "000"
}

echo "=== Smoke: Identity ==="
c="$(code "$IDENTITY_BASE/health/live")"; [[ "$c" == "200" ]] && ok "identity live" || bad "identity live ($c)"
c="$(code "$IDENTITY_BASE/health/ready")"; [[ "$c" == "200" ]] && ok "identity ready" || bad "identity ready ($c)"
if curl -fsS "$IDENTITY_BASE/version" | grep -q git_sha; then ok "identity version"; else bad "identity version"; fi
c="$(code -X POST "$IDENTITY_BASE/auth/login" -H 'Content-Type: application/json' -d '{}')"
[[ "$c" != "000" ]] && ok "identity login reachable ($c)" || bad "identity login reachable"
c="$(code "$IDENTITY_BASE/users/me")"
[[ "$c" == "401" || "$c" == "403" ]] && ok "identity protected rejects anon" || bad "identity protected ($c)"

echo "=== Smoke: Stays ==="
c="$(code "$STAYS_BASE/health/live")"; [[ "$c" == "200" ]] && ok "stays live" || bad "stays live ($c)"
c="$(code "$STAYS_BASE/health/ready")"; [[ "$c" == "200" ]] && ok "stays ready" || bad "stays ready ($c)"
c="$(code "$STAYS_BASE/stays/explore")"
[[ "$c" == "200" || "$c" == "304" ]] && ok "stays public browse" || bad "stays public browse ($c)"
c="$(code "$STAYS_BASE/stays/host/listings")"
[[ "$c" == "401" || "$c" == "403" ]] && ok "stays protected rejects anon" || bad "stays protected ($c)"

if [[ -n "$EXPECT_NEXA_ENV" ]]; then
  if curl -fsS "$STAYS_BASE/version" | grep -q "$EXPECT_NEXA_ENV"; then
    ok "version nexa_env=$EXPECT_NEXA_ENV"
  else
    bad "version nexa_env"
  fi
fi

if [[ "$EXPECT_SWAGGER" == "false" ]]; then
  c="$(code "$IDENTITY_BASE/docs")"
  [[ "$c" == "404" || "$c" == "401" || "$c" == "403" || "$c" == "302" ]] && ok "swagger gated ($c)" || bad "swagger unexpected ($c)"
fi

if [[ -n "$CORS_OK" ]]; then
  hdr="$(curl -sS -D - -o /dev/null -H "Origin: $CORS_OK" -H 'Access-Control-Request-Method: GET' -X OPTIONS "$STAYS_BASE/health/live" || true)"
  echo "$hdr" | grep -qi 'access-control-allow-origin' && ok "CORS allows trusted" || bad "CORS allows trusted"
fi
hdr="$(curl -sS -D - -o /dev/null -H "Origin: $CORS_BAD" -H 'Access-Control-Request-Method: GET' -X OPTIONS "$STAYS_BASE/health/live" || true)"
if echo "$hdr" | grep -qi "access-control-allow-origin: $CORS_BAD"; then
  bad "CORS rejected bad origin"
else
  ok "CORS rejects bad origin"
fi

echo "=== Smoke summary: pass=$pass fail=$fail ==="
[[ "$fail" -eq 0 ]]
