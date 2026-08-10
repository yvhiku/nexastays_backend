#!/usr/bin/env bash
# Shared rsync for CI → host deploy package (B1).
# Synchronizes release files only; never deletes host-owned secrets.
set -euo pipefail

SRC="${1:?source deploy/ directory}"
DEST="${2:?user@host:remote/path or local dest}"
EXCLUDES_FILE="$(cd "$(dirname "$0")" && pwd)/ci-rsync-excludes.txt"

if [[ ! -f "$EXCLUDES_FILE" ]]; then
  echo "FAIL: missing $EXCLUDES_FILE" >&2
  exit 1
fi

# --delete only removes files under DEST that are part of the release tree and
# not matched by excludes. Host-owned secrets are protected by --exclude-from.
rsync -az --delete \
  --exclude-from="$EXCLUDES_FILE" \
  "${SRC%/}/" "${DEST%/}/"
