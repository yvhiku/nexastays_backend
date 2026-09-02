# Cloudflare origin hardening

This runbook restricts the Nexa Stays VPS web ports to Cloudflare while keeping
key-only SSH available. It does not change Cloudflare DNS, application code,
containers, databases, or Let's Encrypt certificates.

Run it from an active SSH session so the script can verify that port 22 is the
current administration path. Keep that session open until a second SSH login
and all public checks have passed.

```bash
cd /opt/nexa/nexastays_backend/deploy
sudo bash scripts/harden-cloudflare-origin.sh --audit
sudo bash scripts/harden-cloudflare-origin.sh --apply
```

If sudo is available only through Hostinger's interactive browser terminal,
use the explicit out-of-band console acknowledgement instead. The flag is
rejected from non-interactive sessions:

```bash
sudo bash scripts/harden-cloudflare-origin.sh --apply --hostinger-console
```

The apply command:

- fetches and validates Cloudflare's current official IPv4/IPv6 ranges;
- creates a timestamped backup in `/var/backups/nexa-cloudflare-hardening/`;
- configures Nginx to trust `CF-Connecting-IP` only from Cloudflare networks;
- allows Cloudflare networks to ports 80/443 and removes only recognized broad
  web rules;
- preserves public key-only SSH on port 22;
- rolls Nginx and UFW back automatically if an apply check fails.

If a later manual rollback is required, use the exact backup path printed by
the apply command:

```bash
sudo bash scripts/harden-cloudflare-origin.sh \
  --rollback /var/backups/nexa-cloudflare-hardening/<timestamp> \
  --hostinger-console
```

After apply, verify from a separate Internet connection that the five proxied
hostnames work and direct IPv4/IPv6 connections to origin ports 80/443 fail.
Do not close the original SSH session until a second key-based login succeeds.
