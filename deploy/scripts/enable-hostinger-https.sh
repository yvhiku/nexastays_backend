#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash $0 YOUR_EMAIL" >&2
  exit 1
fi

email="${1:-}"
if [[ -z "$email" || "$email" != *@* ]]; then
  echo "A valid email is required for Let's Encrypt renewal notices." >&2
  echo "Usage: sudo bash $0 you@example.com" >&2
  exit 1
fi

deploy_dir="$(cd "$(dirname "$0")/.." && pwd)"
source_config="$deploy_dir/edge/nexastays.nginx.conf"
target_config="/etc/nginx/sites-available/nexastays"

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y certbot python3-certbot-nginx

install -m 0644 "$source_config" "$target_config"
ln -sfn "$target_config" /etc/nginx/sites-enabled/nexastays
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

certbot --nginx --non-interactive --agree-tos --redirect \
  --email "$email" \
  -d nexastays.ma \
  -d admin.nexastays.ma \
  -d identity.nexastays.ma \
  -d api.nexastays.ma

nginx -t
systemctl reload nginx
systemctl enable --now certbot.timer

echo "Nexa Stays HTTPS enabled for all four domains."
