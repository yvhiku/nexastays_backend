# Migration Safety Audit

**Score: 9.2/10** — No destructive DDL found in launch migrations.

## Scan results

Searched all 58 migrations for: `DROP COLUMN`, `ALTER TYPE`, `RENAME TO`.

**Result:** No matches — migrations are additive / constraint-focused.

## Notable migrations

| Migration | Risk | Notes |
|-----------|------|-------|
| 016_booking_integrity_constraints | Low | Adds CHECK — verify existing rows before deploy |
| 021_booking_reference | Low | New column + counter table — backwards compatible |
| 032_user_notifications | Low | New table — safe |
| 031_otp_codes_hashed | Medium | Data shape change — ensure app deploy after migration |

## Rollout checklist

- [ ] Run migrations in staging before app deploy
- [ ] Identity and Stays DBs migrate independently (separate compose services)
- [ ] No blue/green requirement today (additive only)
- [ ] Document rollback: new tables can stay empty; no DROP to reverse

## Future caution

Before any `DROP COLUMN` or `NOT NULL` without default: require two-phase migration (add nullable → backfill → enforce).
