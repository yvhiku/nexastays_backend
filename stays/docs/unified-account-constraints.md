# Unified Account System: Database Constraints

## Constraint Hierarchy

### Business Invariants (Primary)

| Constraint | Scope | Purpose |
|------------|-------|---------|
| **uniq_consumer_per_unified_identity** | users | **Primary invariant:** One CONSUMER per identity. Shared across Pay, Go rider, Stays guest. |
| uniq_driver_per_unified_identity | users | One DRIVER per identity |
| uniq_courier_per_unified_identity | users | One COURIER per identity |
| uniq_host_per_unified_identity | users | One HOST per identity |
| uniq_merchant_per_unified_identity | users | One MERCHANT per identity (relax when franchise) |

### Transitional / Defense-in-Depth

| Constraint | Scope | Purpose |
|------------|-------|---------|
| **uniq_consumer_per_phone** | users | Transitional. One CONSUMER per phone. Defense in depth until identity backfill complete. Primary invariant is per-identity. |
| idx_identity_phone_numbers_normalized UNIQUE | identity_phone_numbers | One identity per phone (E.164). Canonical for verified login identifiers. |

### CHECK Constraints

| Constraint | Purpose |
|------------|---------|
| chk_users_account_type | Validates account_type enum |

---

## Uniqueness: Identity vs Phone

- **One CONSUMER per unified_identity_id** – True business invariant. Identity is the root; CONSUMER is unique per identity.
- **One CONSUMER per phone** – Transitional. Phones are verified login identifiers in identity_phone_numbers; legacy users.phone_number can duplicate this. Once all identities are backfilled and phone→identity resolution is canonical, per-identity is sufficient.

---

## MERCHANT: One per Identity

**Decision:** One MERCHANT per `unified_identity_id`.

**Rationale:** Typically one person operates one merchant. go_delivery.merchants has `user_id UNIQUE`, so one User = one Merchant row.

**Evolution:** See `merchant-business-entity-evolution.md`. MERCHANT may evolve to MerchantOrganization with operators and branches; relaxation of this constraint would be part of that migration.

**Relaxation:**
```sql
DROP INDEX IF EXISTS uniq_merchant_per_unified_identity;
```

---

## How This Prevents Duplicate Role Accounts

- **Insert time:** Second CONSUMER/DRIVER/COURIER/HOST/MERCHANT for same `unified_identity_id` violates partial unique index → 23505.
- **Concurrency:** ensureRoleAccount catches 23505, re-fetches and returns existing (idempotent).
- **Application flow:** Check for existing before insert; DB constraint is defense in depth.

---

## Foreign Keys and Indexes

| Object | Purpose |
|--------|---------|
| users.unified_identity_id | FK to unified_identities(id) ON DELETE SET NULL |
| idx_users_unified_identity_id | Lookup users by identity |
| idx_users_unified_identity_account_type | Fast findByUnifiedIdentityIdAndAccountType |

---

## Backward Compatibility

1. **unified_identity_id IS NULL:** Partial unique indexes exclude NULL; legacy rows not constrained until backfill.
2. **Pre-migration duplicates:** Migration fails if duplicates exist. Run pre-check queries in migration comments; resolve before applying.
3. **MERCHANT franchise:** Drop uniq_merchant_per_unified_identity if multi-merchant-per-person required.

---

## Migration Order

024 → 025 → **026_identity_phone_numbers** (create table, backfill) → 026_one_consumer_per_identity → 027 → 028 → 029 → 030 → 031
