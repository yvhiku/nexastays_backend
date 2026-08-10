#!/usr/bin/env bash
# Enforce chmod 600 on secret env files (B8). Never prints file contents.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: secure-env-perms.sh <file> [file...]" >&2
  exit 1
fi

if ! command -v chmod >/dev/null 2>&1; then
  echo "FAIL: chmod unavailable; secret env files require a Unix deploy host" >&2
  exit 1
fi

for f in "$@"; do
  if [[ ! -f "$f" ]]; then
    echo "FAIL: missing $f" >&2
    exit 1
  fi
  chmod 600 "$f"
  # Best-effort parent dir not world-writable
  dir="$(dirname "$f")"
  chmod go-w "$dir" 2>/dev/null || true
  mode="$(stat -c '%a' "$f" 2>/dev/null || stat -f '%OLp' "$f" 2>/dev/null || echo '')"
  if [[ -n "$mode" && "$mode" != "600" && "$mode" != "0600" ]]; then
    echo "FAIL: could not set mode 600 on $f (got $mode)" >&2
    exit 1
  fi
  echo "OK: permissions 600 on $(basename "$f")"
done
