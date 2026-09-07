# Gate 4 — Encrypted R2 restore (PASS)

Date: 2026-09-07  
Host: `srv1894430` (production VPS)  
Operator: `nexa` + sudo  
Set: `2026-09-07_02-15-51_srv1894430`

## Command (secrets not logged)

```bash
sudo /opt/nexa/backup-tools/scripts/restore-r2-drill.sh \
  --backup-set '2026-09-07_02-15-51_srv1894430' \
  --age-key-file /run/nexa-recovery/age-key.txt
# age key removed after drill
```

## Result (redacted operator log)

```text
{"level":"SUCCESS","msg":"restore.database.ok","detail":"database=identity schema=true data=true queries=true"}
{"level":"SUCCESS","msg":"restore.database.ok","detail":"database=stays schema=true data=true queries=true"}
{"level":"SUCCESS","msg":"restore.roles.validated","detail":"database=identity applied=false"}
{"level":"SUCCESS","msg":"restore.roles.validated","detail":"database=stays applied=false"}
{"level":"SUCCESS","msg":"restore_drill.passed","detail":"set=2026-09-07_02-15-51_srv1894430 postgres=16 isolated_network=true host_ports=none production_unchanged=true"}
{"ok":true,"accepted":true}
{"level":"SUCCESS","msg":"backup.alerts.sent","detail":"email=true webhook=true status=success"}
```

## Proven

- R2 retrieve of encrypted age objects for Identity + Stays  
- Encrypted checksum verification + age decrypt  
- Isolated Postgres 16 restore (no host ports)  
- Schema/data/query checks  
- Roles artifacts validated (not applied)  
- Production DB containers/volumes unchanged  
- Success alert path (email + webhook)  

## Also retained

- Local workstation age drill: [encrypted-local-drill.txt](./encrypted-local-drill.txt)  
- `pg_restore` failure-closed: [failure-regression.txt](./failure-regression.txt)  

## Notes

- Temporary age private key was used from `/run/nexa-recovery/` and removed after the drill.  
- Local RTO for this VPS drill was on the order of ~7s wall between first and last SUCCESS lines in the paste (not a formal production RTO SLA measurement).
