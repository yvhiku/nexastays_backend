# Unified Account Creation: Concurrency Hardening

## Race-Prone Flows (Audit)

| Flow | Pattern | Risk | DB Constraint | Fix |
|------|---------|------|---------------|-----|
| findOrCreateByPhone | find → create identity → attach phone | Duplicate identities | identity_phone_numbers UNIQUE(normalized) | Advisory lock + transaction; on 23505 re-fetch |
| createUser | find → insert user+wallet | Duplicate CONSUMER | uniq_consumer_per_phone | Catch 23505; return existing |
| findOrCreateForKyc | find → insert user+wallet | Same as createUser | uniq_consumer_per_phone | Catch 23505; return existing |
| attachPhoneNumberToIdentity | find → insert | Duplicate attach | UNIQUE(normalized_phone_number) | Catch 23505; same identity → return row; other → Conflict |
| ensureRoleAccount | find → doCreateRoleAccount | Duplicate role | uniq_*_per_unified_identity | Catch 23505; return existing |
| Host/Driver approve | FOR UPDATE on app; then findOrCreate... | Post-txn races | - | Sub-ops idempotent; constraints enforce |

---

## Implementation Summary

1. **findOrCreateByPhone** – Advisory lock `pg_advisory_xact_lock(hashtext(phone))` in transaction. Serializes per-phone creation. On attach 23505, re-fetch identity.
2. **createUser** – Transaction; catch 23505 (uniq_consumer_per_phone), return existing consumer.
3. **findOrCreateForKyc** – Same pattern; catch 23505, return existing.
4. **attachPhoneNumberToIdentity** – Catch 23505; if same identity_id return row (idempotent); else Conflict.
5. **ensureRoleAccount / doCreateRoleAccount** – Catch 23505 (uniq_*_per_unified_identity), re-fetch and return.
6. **Approval flows** – SELECT FOR UPDATE on application; sub-calls idempotent.

---

## Terminology

- **identity_phone_numbers** – Canonical source for verified login identifiers. UNIQUE(normalized_phone_number) ensures one identity per phone.
- **uniq_consumer_per_unified_identity** – Primary invariant for one CONSUMER per identity.
- **uniq_consumer_per_phone** – Transitional defense in depth.
