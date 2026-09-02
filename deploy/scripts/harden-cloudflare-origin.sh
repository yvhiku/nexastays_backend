#!/usr/bin/env bash
set -Eeuo pipefail

export LC_ALL=C
IFS=$'\n\t'

readonly BACKUP_ROOT="/var/backups/nexa-cloudflare-hardening"
readonly REAL_IP_CONFIG="/etc/nginx/conf.d/cloudflare-real-ip.conf"
readonly CF_IPV4_URL="https://www.cloudflare.com/ips-v4"
readonly CF_IPV6_URL="https://www.cloudflare.com/ips-v6"
readonly ORIGIN_IPV4="72.60.133.228"
readonly ORIGIN_IPV6="2a02:4780:79:8a53::1"
readonly SSH_PORT="22"
readonly -a COMPOSE_FILES=(
  "/opt/nexa/nexastays_backend/deploy/docker-compose.host.yml"
  "/opt/nexa/nexastays_backend/deploy/docker-compose.release.yml"
  "/opt/nexa/nexastays_db/docker-compose.yml"
)
readonly -a PRIVATE_PORTS=(3001 3002 3005 3010 5433 5434 6379)

WORK_DIR=""
CURRENT_BACKUP=""
MUTATION_STARTED=0
ALLOW_HOSTINGER_CONSOLE=0

log() {
  printf '[nexa-cloudflare] %s\n' "$*"
}

warn() {
  printf '[nexa-cloudflare] WARNING: %s\n' "$*" >&2
}

die() {
  printf '[nexa-cloudflare] ERROR: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage:
  sudo bash harden-cloudflare-origin.sh --audit
  sudo bash harden-cloudflare-origin.sh --apply [--hostinger-console]
  sudo bash harden-cloudflare-origin.sh --rollback /var/backups/nexa-cloudflare-hardening/<timestamp> [--hostinger-console]

Modes:
  --audit       Run every read-only preflight and print the current exposure.
  --apply       Back up Nginx/UFW/Compose, configure trusted Cloudflare real IPs,
                and restrict UFW ports 80/443 to Cloudflare IPv4/IPv6 ranges.
  --rollback    Restore the Nginx real-IP file and UFW rules from one backup.

Safety override:
  --hostinger-console
                Explicitly confirm that the command is running in Hostinger's
                interactive out-of-band browser terminal when SSH_CONNECTION
                is unavailable. It is rejected outside an interactive TTY.
EOF
}

cleanup() {
  if [[ -n "$WORK_DIR" && -d "$WORK_DIR" ]]; then
    rm -rf -- "$WORK_DIR"
  fi
}
trap cleanup EXIT

require_root() {
  [[ "$EUID" -eq 0 ]] || die "Run this script with sudo."
}

require_commands() {
  local command_name
  for command_name in curl python3 nginx ufw sshd systemctl docker ss install cp awk grep sed sort ip flock; do
    command -v "$command_name" >/dev/null 2>&1 || die "Required command is missing: $command_name"
  done
}

prepare_work_dir() {
  [[ -z "$WORK_DIR" ]] || return 0
  WORK_DIR="$(mktemp -d /tmp/nexa-cloudflare-hardening.XXXXXX)"
  chmod 0700 "$WORK_DIR"
}

fetch_cloudflare_ranges() {
  prepare_work_dir
  log "Fetching the current official Cloudflare IP ranges."
  curl --fail --silent --show-error --location \
    --proto '=https' --tlsv1.2 --retry 3 --retry-delay 2 --connect-timeout 10 --max-time 45 \
    "$CF_IPV4_URL" -o "$WORK_DIR/cloudflare-ipv4.txt"
  curl --fail --silent --show-error --location \
    --proto '=https' --tlsv1.2 --retry 3 --retry-delay 2 --connect-timeout 10 --max-time 45 \
    "$CF_IPV6_URL" -o "$WORK_DIR/cloudflare-ipv6.txt"

  python3 - "$WORK_DIR/cloudflare-ipv4.txt" "$WORK_DIR/cloudflare-ipv6.txt" <<'PY'
import ipaddress
import pathlib
import sys

paths = [(pathlib.Path(sys.argv[1]), 4, 10), (pathlib.Path(sys.argv[2]), 6, 5)]
for path, version, minimum in paths:
    raw = [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if len(raw) < minimum:
        raise SystemExit(f"{path}: expected at least {minimum} Cloudflare IPv{version} ranges, got {len(raw)}")
    if len(raw) != len(set(raw)):
        raise SystemExit(f"{path}: duplicate CIDR entries are not allowed")
    normalized = []
    for value in raw:
        network = ipaddress.ip_network(value, strict=True)
        if network.version != version:
            raise SystemExit(f"{path}: wrong address family: {value}")
        if not network.is_global:
            raise SystemExit(f"{path}: non-global network rejected: {value}")
        normalized.append(str(network))
    path.write_text("\n".join(normalized) + "\n", encoding="utf-8")
PY
}

assert_safe_admin_session() {
  if [[ -z "${SSH_CONNECTION:-}" ]]; then
    [[ "$ALLOW_HOSTINGER_CONSOLE" -eq 1 ]] \
      || die "No SSH_CONNECTION detected. From Hostinger's interactive browser terminal, rerun with --hostinger-console."
    [[ -t 0 && -t 1 ]] \
      || die "--hostinger-console is allowed only from an interactive terminal."
    log "Hostinger out-of-band console explicitly confirmed; SSH_CONNECTION is unavailable."
    return 0
  fi

  local client_ip client_port server_ip server_port extra
  IFS=' ' read -r client_ip client_port server_ip server_port extra <<<"$SSH_CONNECTION"
  [[ -n "$client_ip" && -n "$client_port" && -n "$server_ip" && "$server_port" == "$SSH_PORT" && -z "${extra:-}" ]] \
    || die "Unexpected SSH_CONNECTION value; refusing to change the firewall."
  log "Active SSH session confirmed: ${client_ip} -> ${server_ip}:${server_port}."
}

assert_ssh_hardening() {
  local effective
  effective="$(sshd -T)"
  grep -qx "port $SSH_PORT" <<<"$effective" || die "Effective SSH port is not $SSH_PORT."
  grep -qx "passwordauthentication no" <<<"$effective" || die "SSH password authentication is not disabled."
  grep -qx "pubkeyauthentication yes" <<<"$effective" || die "SSH public-key authentication is not enabled."
  grep -qx "permitrootlogin no" <<<"$effective" || die "SSH root login is not disabled."
  systemctl is-active --quiet ssh || die "SSH service is not active."
}

assert_ufw_baseline() {
  local status verbose default_config
  status="$(ufw status)"
  grep -qx "Status: active" <<<"$(printf '%s\n' "$status" | head -n 1)" || die "UFW is not active."

  verbose="$(ufw status verbose)"
  grep -Eq '^Default: deny \(incoming\)' <<<"$verbose" || die "UFW default incoming policy is not deny."

  default_config="$(grep -E '^(IPV6|DEFAULT_INPUT_POLICY)=' /etc/default/ufw || true)"
  grep -qx 'IPV6=yes' <<<"$default_config" || die "UFW IPv6 filtering is not enabled."
  grep -qx 'DEFAULT_INPUT_POLICY="DROP"' <<<"$default_config" || die "UFW DEFAULT_INPUT_POLICY is not DROP."
}

assert_nginx() {
  systemctl is-active --quiet nginx || die "Nginx service is not active."
  nginx -t
}

assert_private_port() {
  local port="$1"
  local listeners
  listeners="$(ss -H -lnt | awk -v p=":$port" '$4 ~ (p "$") {print $4}')"
  [[ -n "$listeners" ]] || die "Expected private service port $port is not listening."
  if grep -Eq "^(0\.0\.0\.0|\*|\[::\]|::):${port}$" <<<"$listeners"; then
    die "Sensitive/application port $port is publicly bound: $listeners"
  fi
  while IFS= read -r listener; do
    [[ "$listener" == "127.0.0.1:$port" || "$listener" == "[::1]:$port" || "$listener" == "::1:$port" ]] \
      || die "Unexpected non-loopback binding for port $port: $listener"
  done <<<"$listeners"
}

assert_docker_state() {
  local unhealthy
  docker info >/dev/null
  unhealthy="$(docker ps --filter health=unhealthy --format '{{.Names}}' || true)"
  [[ -z "$unhealthy" ]] || die "Unhealthy Docker containers detected: $unhealthy"

  local port
  for port in "${PRIVATE_PORTS[@]}"; do
    assert_private_port "$port"
  done
}

assert_compose_files() {
  local compose_file
  for compose_file in "${COMPOSE_FILES[@]}"; do
    [[ -f "$compose_file" ]] || die "Required Compose file is missing: $compose_file"
  done
}

classify_broad_web_rules() {
  local output_file="$1"
  : >"$output_file"

  local line number destination
  while IFS= read -r line; do
    [[ "$line" =~ ^\[[[:space:]]*([0-9]+)\] ]] || continue
    number="${BASH_REMATCH[1]}"
    [[ "$line" == *"ALLOW IN"* && "$line" == *"Anywhere"* ]] || continue

    destination="${line#*] }"
    destination="${destination%%  ALLOW IN*}"
    destination="$(sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' <<<"$destination")"

    case "$destination" in
      "80/tcp"|"443/tcp"|"80/tcp (v6)"|"443/tcp (v6)"|\
      "Nginx HTTP"|"Nginx HTTPS"|"Nginx Full"|\
      "Nginx HTTP (v6)"|"Nginx HTTPS (v6)"|"Nginx Full (v6)")
        printf '%s\t%s\n' "$number" "$line" >>"$output_file"
        ;;
      *80*|*443*|*Nginx*)
        die "Unrecognized broad web allow rule; no firewall changes made: $line"
        ;;
    esac
  done < <(ufw status numbered)
}

run_local_health_checks() {
  local url status
  local -a urls=(
    "http://127.0.0.1:3005/en"
    "http://127.0.0.1:3010/"
    "http://127.0.0.1:3001/api/v1/health/ready"
    "http://127.0.0.1:3002/api/v1/health/ready"
  )
  for url in "${urls[@]}"; do
    status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
      --connect-timeout 5 --max-time 15 "$url")"
    [[ "$status" =~ ^[23][0-9][0-9]$ ]] || die "Local health check failed: $url returned $status"
  done
}

run_public_health_checks() {
  local url status
  local -a urls=(
    "https://nexastays.ma"
    "https://www.nexastays.ma"
    "https://admin.nexastays.ma"
    "https://identity.nexastays.ma/api/v1/health/ready"
    "https://api.nexastays.ma/api/v1/health/ready"
  )
  for url in "${urls[@]}"; do
    status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
      --connect-timeout 8 --max-time 20 "$url")"
    [[ "$status" =~ ^[23][0-9][0-9]$ ]] || die "Public Cloudflare-path check failed: $url returned $status"
  done
}

print_audit() {
  log "UFW status"
  ufw status numbered
  ufw status verbose
  log "Listening sockets"
  ss -tulpn
  log "Docker containers"
  docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}'
  log "Docker networks"
  docker network ls
  log "Effective SSH policy"
  sshd -T | grep -E '^(port|listenaddress|permitrootlogin|passwordauthentication|pubkeyauthentication|allowusers|allowgroups)' || true
  log "Nginx Cloudflare real-IP directives"
  grep -R -n -E 'set_real_ip_from|real_ip_header|real_ip_recursive' /etc/nginx 2>/dev/null || true
  log "Cloudflare IPv4 ranges"
  cat "$WORK_DIR/cloudflare-ipv4.txt"
  log "Cloudflare IPv6 ranges"
  cat "$WORK_DIR/cloudflare-ipv6.txt"
}

run_preflight() {
  require_root
  require_commands
  fetch_cloudflare_ranges
  assert_ssh_hardening
  assert_ufw_baseline
  assert_nginx
  assert_docker_state
  assert_compose_files
  run_local_health_checks
}

create_backup() {
  local timestamp
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  CURRENT_BACKUP="$BACKUP_ROOT/$timestamp"

  install -d -m 0700 "$BACKUP_ROOT"
  [[ ! -e "$CURRENT_BACKUP" ]] || die "Backup path already exists: $CURRENT_BACKUP"
  install -d -m 0700 "$CURRENT_BACKUP" "$CURRENT_BACKUP/compose"

  cp -a /etc/nginx "$CURRENT_BACKUP/nginx"
  cp -a /etc/ufw "$CURRENT_BACKUP/ufw"
  cp -a /etc/default/ufw "$CURRENT_BACKUP/default-ufw"
  ufw status numbered >"$CURRENT_BACKUP/ufw-status-numbered.txt"
  ufw status verbose >"$CURRENT_BACKUP/ufw-status-verbose.txt"
  sshd -T >"$CURRENT_BACKUP/sshd-effective.txt"
  ss -tulpn >"$CURRENT_BACKUP/listening-sockets.txt"
  docker ps --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}' >"$CURRENT_BACKUP/docker-ps.txt"
  command -v iptables-save >/dev/null 2>&1 && iptables-save >"$CURRENT_BACKUP/iptables.rules"
  command -v ip6tables-save >/dev/null 2>&1 && ip6tables-save >"$CURRENT_BACKUP/ip6tables.rules"
  cp -a "$WORK_DIR/cloudflare-ipv4.txt" "$CURRENT_BACKUP/"
  cp -a "$WORK_DIR/cloudflare-ipv6.txt" "$CURRENT_BACKUP/"

  local compose_file safe_name
  for compose_file in "${COMPOSE_FILES[@]}"; do
    safe_name="${compose_file#/}"
    safe_name="${safe_name//\//__}"
    cp -a "$compose_file" "$CURRENT_BACKUP/compose/$safe_name"
  done

  cat >"$CURRENT_BACKUP/metadata.txt" <<EOF
created_utc=$timestamp
hostname=$(hostname)
origin_ipv4=$ORIGIN_IPV4
origin_ipv6=$ORIGIN_IPV6
ssh_connection=${SSH_CONNECTION:-not-set}
EOF
  chmod -R go-rwx "$CURRENT_BACKUP"
  log "Backup created: $CURRENT_BACKUP"
}

restore_backup() {
  local backup_dir="$1"
  [[ "$backup_dir" == "$BACKUP_ROOT"/* ]] || die "Rollback path must be a child of $BACKUP_ROOT."
  [[ -d "$backup_dir/nginx" && -d "$backup_dir/ufw" && -f "$backup_dir/default-ufw" ]] \
    || die "Backup is incomplete: $backup_dir"

  log "Restoring Nginx and UFW from $backup_dir"
  if [[ -f "$backup_dir/nginx/conf.d/cloudflare-real-ip.conf" ]]; then
    install -m 0644 "$backup_dir/nginx/conf.d/cloudflare-real-ip.conf" "$REAL_IP_CONFIG"
  else
    rm -f -- "$REAL_IP_CONFIG"
  fi
  cp -a "$backup_dir/ufw/user.rules" /etc/ufw/user.rules
  cp -a "$backup_dir/ufw/user6.rules" /etc/ufw/user6.rules
  cp -a "$backup_dir/default-ufw" /etc/default/ufw

  nginx -t
  ufw reload
  systemctl reload nginx
  log "Rollback completed. Confirm public HTTPS and open a second SSH session."
}

rollback_on_error() {
  local exit_code=$?
  trap - ERR
  if [[ "$MUTATION_STARTED" -eq 1 && -n "$CURRENT_BACKUP" ]]; then
    warn "Apply failed; restoring the pre-change Nginx and UFW configuration."
    restore_backup "$CURRENT_BACKUP" || warn "Automatic rollback encountered an error; use --rollback $CURRENT_BACKUP from the active SSH session."
  fi
  exit "$exit_code"
}

write_nginx_real_ip_config() {
  local candidate="$WORK_DIR/cloudflare-real-ip.conf"
  {
    printf '%s\n' '# Managed by Nexa Stays Cloudflare origin hardening.'
    printf '%s\n' '# Source: https://www.cloudflare.com/ips/'
    printf '%s\n' '# Trust only Cloudflare proxy networks before accepting CF-Connecting-IP.'
    while IFS= read -r cidr; do
      printf 'set_real_ip_from %s;\n' "$cidr"
    done <"$WORK_DIR/cloudflare-ipv4.txt"
    while IFS= read -r cidr; do
      printf 'set_real_ip_from %s;\n' "$cidr"
    done <"$WORK_DIR/cloudflare-ipv6.txt"
    printf '%s\n' 'real_ip_header CF-Connecting-IP;'
    printf '%s\n' 'real_ip_recursive on;'
  } >"$candidate"
  install -m 0644 "$candidate" "$REAL_IP_CONFIG"
  nginx -t
  systemctl reload nginx
}

add_cloudflare_ufw_rules() {
  local cidr
  while IFS= read -r cidr; do
    ufw allow proto tcp from "$cidr" to any port 80 comment 'Nexa Cloudflare HTTP'
    ufw allow proto tcp from "$cidr" to any port 443 comment 'Nexa Cloudflare HTTPS'
  done <"$WORK_DIR/cloudflare-ipv4.txt"
  while IFS= read -r cidr; do
    ufw allow proto tcp from "$cidr" to any port 80 comment 'Nexa Cloudflare HTTP'
    ufw allow proto tcp from "$cidr" to any port 443 comment 'Nexa Cloudflare HTTPS'
  done <"$WORK_DIR/cloudflare-ipv6.txt"
}

remove_recognized_broad_web_rules() {
  local classified="$WORK_DIR/broad-web-rules.txt"
  classify_broad_web_rules "$classified"
  [[ -s "$classified" ]] || return 0

  log "Removing only recognized broad web rules:"
  cut -f2- "$classified"
  mapfile -t rule_numbers < <(cut -f1 "$classified" | sort -rn)
  local rule_number
  for rule_number in "${rule_numbers[@]}"; do
    ufw --force delete "$rule_number"
  done
}

assert_no_broad_web_rules() {
  local classified="$WORK_DIR/broad-web-rules-after.txt"
  classify_broad_web_rules "$classified"
  [[ ! -s "$classified" ]] || die "Broad Internet web rules remain after UFW update."
}

assert_cloudflare_ufw_rules() {
  local added
  added="$(ufw show added)"
  local cidr
  while IFS= read -r cidr; do
    grep -Fq "from $cidr to any port 80 proto tcp" <<<"$added" || die "Missing UFW HTTP rule for $cidr"
    grep -Fq "from $cidr to any port 443 proto tcp" <<<"$added" || die "Missing UFW HTTPS rule for $cidr"
  done <"$WORK_DIR/cloudflare-ipv4.txt"
  while IFS= read -r cidr; do
    grep -Fq "from $cidr to any port 80 proto tcp" <<<"$added" || die "Missing UFW HTTP rule for $cidr"
    grep -Fq "from $cidr to any port 443 proto tcp" <<<"$added" || die "Missing UFW HTTPS rule for $cidr"
  done <"$WORK_DIR/cloudflare-ipv6.txt"
}

verify_real_ip_self_probe() {
  local marker expected_ip log_line logged_ip
  marker="__nexa_cf_real_ip_probe_$(date +%s)_$RANDOM"
  expected_ip="$(ip -4 route get 1.1.1.1 | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}')"
  [[ "$expected_ip" == "$ORIGIN_IPV4" ]] || die "Unexpected origin egress IPv4: $expected_ip"

  curl -4 --silent --show-error --output /dev/null --connect-timeout 8 --max-time 20 \
    "https://nexastays.ma/$marker"
  sleep 1
  log_line="$(grep -F "$marker" /var/log/nginx/access.log | tail -n 1 || true)"
  [[ -n "$log_line" ]] || die "Real-IP probe was not found in the Nginx access log."
  logged_ip="${log_line%% *}"
  [[ "$logged_ip" == "$expected_ip" ]] \
    || die "Nginx real-IP restoration failed: expected $expected_ip, logged $logged_ip"
  log "Nginx real-IP restoration verified with $logged_ip."
}

apply_hardening() {
  run_preflight
  assert_safe_admin_session

  local classified="$WORK_DIR/broad-web-rules-preflight.txt"
  classify_broad_web_rules "$classified"
  if [[ -s "$classified" ]]; then
    log "Recognized broad web rules scheduled for replacement:"
    cut -f2- "$classified"
  else
    log "No recognized broad web rules found; apply will verify existing Cloudflare-only rules."
  fi

  create_backup
  trap rollback_on_error ERR
  MUTATION_STARTED=1

  # Preserve key-only SSH before changing any web rule. This intentionally does
  # not restrict SSH to a potentially dynamic administrator address.
  ufw allow "$SSH_PORT/tcp" comment 'Nexa SSH key-only'

  write_nginx_real_ip_config
  add_cloudflare_ufw_rules
  remove_recognized_broad_web_rules
  ufw reload

  assert_ufw_baseline
  assert_no_broad_web_rules
  assert_cloudflare_ufw_rules
  assert_nginx
  assert_docker_state
  run_local_health_checks
  run_public_health_checks
  verify_real_ip_self_probe

  MUTATION_STARTED=0
  trap - ERR

  log "Cloudflare origin hardening applied successfully."
  log "Backup: $CURRENT_BACKUP"
  log "External IPv4 and IPv6 origin-bypass tests are still required before declaring completion."
  ufw status numbered
}

main() {
  local mode="${1:-}"
  if [[ "$mode" == "--audit" || "$mode" == "--apply" || "$mode" == "--rollback" ]]; then
    require_root
    exec 9>/run/lock/nexa-cloudflare-origin.lock
    flock -n 9 || die "Another Cloudflare origin hardening process is running."
  fi
  case "$mode" in
    --audit)
      [[ "$#" -eq 1 ]] || { usage; exit 2; }
      run_preflight
      print_audit
      log "AUDIT PASS: read-only preconditions are satisfied."
      ;;
    --apply)
      if [[ "$#" -eq 2 && "${2:-}" == "--hostinger-console" ]]; then
        ALLOW_HOSTINGER_CONSOLE=1
      elif [[ "$#" -ne 1 ]]; then
        usage
        exit 2
      fi
      apply_hardening
      ;;
    --rollback)
      if [[ "$#" -eq 3 && "${3:-}" == "--hostinger-console" ]]; then
        ALLOW_HOSTINGER_CONSOLE=1
      elif [[ "$#" -ne 2 ]]; then
        usage
        exit 2
      fi
      require_root
      require_commands
      assert_safe_admin_session
      restore_backup "$2"
      ;;
    -h|--help)
      usage
      ;;
    *)
      usage
      exit 2
      ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
