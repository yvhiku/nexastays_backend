#!/usr/bin/env bash
# Copy dogfood env templates into deploy dir with chmod 600 (B8). Does not invent secrets.
set -euo pipefail

DEPLOY_DIR="${1:-.}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SECURE="$SCRIPT_DIR/secure-env-perms.sh"

mkdir -p "$DEPLOY_DIR"
umask 077

copy_if_missing() {
  local src="$1"
  local dst="$2"
  if [[ -f "$dst" ]]; then
    echo "KEEP: $dst"
  else
    cp "$src" "$dst"
    echo "CREATED: $dst (edit placeholders)"
  fi
  bash "$SECURE" "$dst"
}

copy_if_missing "$ROOT/env/dogfood.env.example" "$DEPLOY_DIR/.env"
copy_if_missing "$ROOT/env/dogfood.identity.env.example" "$DEPLOY_DIR/.env.identity"
copy_if_missing "$ROOT/env/dogfood.stays.env.example" "$DEPLOY_DIR/.env.stays"

echo "=== install-dogfood-env-templates done (edit secrets; values not printed) ==="
