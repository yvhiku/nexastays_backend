#!/usr/bin/env bash
set -euo pipefail

deploy_dir="$(cd "$(dirname "$0")/.." && pwd)"
env_file="$deploy_dir/.env"
backup="$deploy_dir/.env.jwt-repair.$(date -u +%Y%m%dT%H%M%SZ)"
cp "$env_file" "$backup"
chmod 600 "$backup"

# Remove continuation lines left by a previously expanded PEM value.
clean="$(mktemp)"
awk '
  /^JWT_PRIVATE_KEY=/ { print "JWT_PRIVATE_KEY="; skip=1; next }
  /^JWT_PUBLIC_KEY=/ { print "JWT_PUBLIC_KEY="; skip=1; next }
  skip && /^[A-Z][A-Z0-9_]*=/ { skip=0 }
  !skip { print }
' "$env_file" > "$clean"
mv "$clean" "$env_file"

private_pem="$(openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 2>/dev/null)"
public_pem="$(printf '%s\n' "$private_pem" | openssl pkey -pubout 2>/dev/null)"
private_escaped="$(printf '%s\n' "$private_pem" | awk 'BEGIN{ORS=""} {if (NR>1) printf "\\n"; printf "%s", $0}')"
public_escaped="$(printf '%s\n' "$public_pem" | awk 'BEGIN{ORS=""} {if (NR>1) printf "\\n"; printf "%s", $0}')"

set_key() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  NEXA_ENV_VALUE="$value" awk -v key="$key" '
    index($0, key "=") == 1 { print key "=" ENVIRON["NEXA_ENV_VALUE"]; next }
    { print }
  ' "$env_file" > "$tmp"
  mv "$tmp" "$env_file"
}

set_key JWT_PRIVATE_KEY "$private_escaped"
set_key JWT_PUBLIC_KEY "$public_escaped"
chmod 600 "$env_file"
echo "JWT dotenv encoding repaired. Backup: $backup"
