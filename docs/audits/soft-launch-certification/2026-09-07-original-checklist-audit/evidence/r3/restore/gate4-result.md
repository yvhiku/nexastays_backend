# Gate 4 update — encrypted restore (post-047 work)

## Local encrypted age drill — PASS

Command:

```bash
bash scripts/restore-encrypted-local-drill.sh
```

Evidence: [encrypted-local-drill.txt](./encrypted-local-drill.txt)

Proved on disposable Postgres 16 containers only:

1. Ephemeral age keygen  
2. `pg_dump` → `age` encrypt → SHA-256 manifest  
3. Manifest/byte verification  
4. `age --decrypt` → `pg_restore --exit-on-error`  
5. Representative row counts match (Identity 7 / Stays 11)  
6. App compose DB containers (`5433`/`5434` services) identity unchanged  
7. Local RTO ≈ 4s (not production RTO)

New script: `nexastays_db/scripts/restore-encrypted-local-drill.sh`

## Production R2 operator drill — still UNVERIFIED

`restore-r2-drill.sh` still blocked:

| Prerequisite | Status |
|--------------|--------|
| `rclone` | MISSING |
| `/etc/nexa/backup.env` | missing |
| Approved R2 backup set + off-server age private key | unavailable |
| `sudo` operator drill on backup host | not authorized here |

Do **not** treat the local age drill as Cloudflare R2 retrieve certification.

## Alert path

Backup failure alert receipt: UNVERIFIED (no `ALERT_*` config in this environment).
