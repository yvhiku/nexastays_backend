#!/usr/bin/env bash
# Public release smoke checks for Web, Dashboard, and critical SEO routes.
set -euo pipefail

WEB_BASE_URL="${SMOKE_WEB_BASE_URL:?SMOKE_WEB_BASE_URL required}"
DASHBOARD_BASE_URL="${SMOKE_DASHBOARD_BASE_URL:?SMOKE_DASHBOARD_BASE_URL required}"

check_200() {
  local url="$1"
  local code
  code="$(curl -sS -L -o /dev/null --max-time 20 -w '%{http_code}' "$url")"
  if [[ "$code" != "200" ]]; then
    echo "FAIL $code $url" >&2
    return 1
  fi
  echo "OK 200 $url"
}

check_200 "${WEB_BASE_URL%/}/en"
check_200 "${WEB_BASE_URL%/}/en/registration"
check_200 "${WEB_BASE_URL%/}/en/stays/casablanca"
check_200 "${WEB_BASE_URL%/}/en/stays/casablanca/apartments"
check_200 "${WEB_BASE_URL%/}/en/stays/casablanca/anfa"
check_200 "${WEB_BASE_URL%/}/en/stays/apartments"
check_200 "${WEB_BASE_URL%/}/en/guides"
check_200 "${WEB_BASE_URL%/}/en/guides/casablanca-travel-guide"
check_200 "${WEB_BASE_URL%/}/fr/stays/marrakech"
check_200 "${DASHBOARD_BASE_URL%/}/"

echo "All public web release smoke checks passed."
