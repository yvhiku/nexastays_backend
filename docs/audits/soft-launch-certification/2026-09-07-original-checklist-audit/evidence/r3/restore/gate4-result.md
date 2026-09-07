# Gate 4 — Encrypted R2 restore (R3)

## Attempt

Isolated `restore-r2-drill.sh` was **not executed** in this workstation session.

## Prerequisites missing (exact)

| Prerequisite | Status |
|--------------|--------|
| `age` CLI | MISSING |
| `rclone` CLI | MISSING |
| `/etc/nexa/backup.env` (or `NEXA_BACKUP_ENV_FILE`) | not present locally |
| Temporary off-server age private key | not supplied (must not live in `/etc/nexa` or repo) |
| Approved R2 bucket + backup set id | unavailable |
| Root/`sudo` operator drill | not authorized in this local-only R3 run |

## What was verified instead

- `scripts/test-restore-failure.sh` — nonzero `pg_restore` exit fails closed (PASS regression).
- Native disposable pg_dump/pg_restore already evidenced in original audit 029/030 (plaintext local only).
- `scripts/restore-drill.sh` quarantined with OBSOLETE banner pointing to `restore-r2-drill.sh`.

## Result for soft-launch / production recovery gate

**UNVERIFIED — ENCRYPTED R2 RECOVERY NOT EXERCISED**

Do not convert original recovery certification beyond local plaintext 029/030 based on this gate.

## Required next action

On an authorized operator host with backup tooling installed:

```bash
sudo /opt/nexa/backup-tools/scripts/restore-r2-drill.sh \
  --backup-set <SET_ID> \
  --age-key-file /run/nexa-recovery/age-key.txt
# then remove temporary key; force a backup failure and confirm alert receipt
```
