#!/usr/bin/env bash
# Append deployment observability record (no secrets).
set -euo pipefail

ENV_FILE="${1:?}"
RESULT="${2:?}"
LOG_DIR="${DEPLOY_LOG_DIR:-./.deploy-logs}"
mkdir -p "$LOG_DIR"

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

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
file="$LOG_DIR/deployments.jsonl"
printf '{"ts":"%s","nexa_env":"%s","image_tag":"%s","image_registry":"%s","build_version":"%s","result":"%s"}\n' \
  "$ts" "$(get_val NEXA_ENV)" "$(get_val IMAGE_TAG)" "$(get_val IMAGE_REGISTRY)" "$(get_val BUILD_VERSION)" "$RESULT" >>"$file"
echo "Recorded deployment result=$RESULT → $file"
