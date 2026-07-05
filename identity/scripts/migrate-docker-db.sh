#!/usr/bin/env bash
# Apply pending SQL migrations to Docker Postgres (nexa-db).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(dirname "$SCRIPT_DIR")"
MIGRATIONS_DIR="$BACKEND_ROOT/database/migrations"
CONTAINER="${NEXA_DB_CONTAINER:-nexa-db}"
DB="${DB_NAME:-nexapay}"
USER="${DB_USERNAME:-postgres}"

BASELINE=false
SINGLE_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --baseline) BASELINE=true; shift ;;
    --file) SINGLE_FILE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Container $CONTAINER is not running. Start: docker compose -f infra/docker-compose.db.yml up -d"
  exit 1
fi

psql_exec() {
  docker exec -i "$CONTAINER" psql -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 "$@"
}

psql_exec -c "CREATE TABLE IF NOT EXISTS schema_migrations (
  filename VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);"

mapfile -t APPLIED < <(docker exec "$CONTAINER" psql -U "$USER" -d "$DB" -t -A -c "SELECT filename FROM schema_migrations ORDER BY filename;")

is_applied() {
  local f="$1"
  for a in "${APPLIED[@]}"; do
    [[ "$a" == "$f" ]] && return 0
  done
  return 1
}

if [[ -n "$SINGLE_FILE" ]]; then
  FILES=("$SINGLE_FILE")
else
  mapfile -t FILES < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' -printf '%f\n' | sort)
fi

if $BASELINE; then
  for f in "${FILES[@]}"; do
    is_applied "$f" && continue
    psql_exec -c "INSERT INTO schema_migrations (filename) VALUES ('${f//\'/\'\'}') ON CONFLICT DO NOTHING;"
    echo "marked: $f"
  done
  exit 0
fi

for f in "${FILES[@]}"; do
  is_applied "$f" && continue
  echo ">> $f"
  psql_exec < "$MIGRATIONS_DIR/$f"
  psql_exec -c "INSERT INTO schema_migrations (filename) VALUES ('${f//\'/\'\'}') ON CONFLICT DO NOTHING;"
  echo "   OK"
done

echo "Done."
