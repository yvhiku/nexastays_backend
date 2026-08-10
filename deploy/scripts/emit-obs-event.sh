#!/usr/bin/env bash
# Emit a structured observability JSON line (and optional webhook). Never prints secrets.
# Usage: emit-obs-event.sh EVENT_KEY [severity=P3] [extra_json_object]
set -euo pipefail

EVENT="${1:?event required}"
SEVERITY="${2:-P3}"
EXTRA="${3:-{}}"
SERVICE="${NEXA_SERVICE_NAME:-nexa-deploy}"
ENV_NAME="${NEXA_ENV:-${APP_ENV:-unknown}}"
SHA="${IMAGE_TAG:-${GIT_SHA:-${GITHUB_SHA:-}}}"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

LINE=$(printf '{"ts":"%s","level":"info","channel":"ops","service":"%s","environment":"%s","event":"%s","severity":"%s","release":"%s","context":%s}\n' \
  "$TS" "$SERVICE" "$ENV_NAME" "$EVENT" "$SEVERITY" "$SHA" "$EXTRA")
echo "$LINE"

WEBHOOK="${OPS_ALERT_WEBHOOK_URL:-${PAYMENT_ALERT_WEBHOOK_URL:-}}"
if [[ -n "$WEBHOOK" && ( "$SEVERITY" == "P0" || "$SEVERITY" == "P1" ) ]]; then
  curl -fsS -X POST -H 'Content-Type: application/json' -d "$LINE" "$WEBHOOK" >/dev/null 2>&1 || true
fi
