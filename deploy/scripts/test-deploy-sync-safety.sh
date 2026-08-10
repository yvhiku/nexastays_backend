#!/usr/bin/env bash
# Regression: CI deploy sync must not delete host-owned secret env files (B1).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

SRC="$TMP/src"
DST="$TMP/dst"
mkdir -p "$SRC/scripts" "$DST"

# Simulate a release tree (missing host-only files on the source side)
echo 'compose' >"$SRC/docker-compose.release.yml"
echo 'script' >"$SRC/scripts/remote-deploy.sh"
cp "$ROOT/scripts/ci-rsync-excludes.txt" "$SRC/scripts/ci-rsync-excludes.txt"
cp "$ROOT/scripts/sync-deploy-package.sh" "$SRC/scripts/sync-deploy-package.sh"

# Host-owned secrets already on the destination
echo 'SHARED_SECRET=keep-me' >"$DST/.env"
echo 'ID_SECRET=keep-me' >"$DST/.env.identity"
echo 'ST_SECRET=keep-me' >"$DST/.env.stays"
echo 'BACKUP=keep-me' >"$DST/.env.backup"
mkdir -p "$DST/.deploy-logs"
echo 'log' >"$DST/.deploy-logs/x.jsonl"
# Stale release file that --delete SHOULD remove
echo 'stale' >"$DST/obsolete-release-file.txt"

bash "$SRC/scripts/sync-deploy-package.sh" "$SRC" "$DST"

fail=0
assert_exists() {
  if [[ -f "$1" ]]; then
    echo "PASS: preserved $1"
  else
    echo "FAIL: deleted $1" >&2
    fail=$((fail + 1))
  fi
}
assert_gone() {
  if [[ ! -e "$1" ]]; then
    echo "PASS: removed stale $1"
  else
    echo "FAIL: stale file remains $1" >&2
    fail=$((fail + 1))
  fi
}

assert_exists "$DST/.env"
assert_exists "$DST/.env.identity"
assert_exists "$DST/.env.stays"
assert_exists "$DST/.env.backup"
assert_exists "$DST/.deploy-logs/x.jsonl"
assert_gone "$DST/obsolete-release-file.txt"

# Workflows must call the shared sync helper (static guard)
for wf in "$ROOT/../.github/workflows/deploy-staging.yml" "$ROOT/../.github/workflows/deploy-production.yml"; do
  if grep -q 'sync-deploy-package.sh' "$wf" && ! grep -qE "rsync -az --delete" "$wf"; then
    echo "PASS: workflow $(basename "$wf") uses sync-deploy-package.sh"
  else
    echo "FAIL: workflow $(basename "$wf") still embeds unsafe rsync" >&2
    fail=$((fail + 1))
  fi
done

# Exclude list must name critical host files
for pat in '.env' '.env.*' '.deploy-logs/'; do
  if grep -qxF "$pat" "$ROOT/scripts/ci-rsync-excludes.txt" || grep -qF "$pat" "$ROOT/scripts/ci-rsync-excludes.txt"; then
    echo "PASS: exclude list covers $pat"
  else
    echo "FAIL: exclude list missing $pat" >&2
    fail=$((fail + 1))
  fi
done

echo "=== B1 sync safety: fail=$fail ==="
[[ "$fail" -eq 0 ]]
