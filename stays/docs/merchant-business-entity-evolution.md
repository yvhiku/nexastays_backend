# Merchant Business-Entity Evolution

## Current Reality

| Role | Entity Type | Notes |
|------|-------------|-------|
| CONSUMER, DRIVER, COURIER, HOST | Human (individual) | One person = one identity; profile = person data |
| MERCHANT | **Person-scoped today** | One User(MERCHANT) per UnifiedIdentity; go_delivery.merchants.user_id UNIQUE |

**Current assumptions:**
- MERCHANT created via createRoleAccount / ensureRoleAccount
- uniq_merchant_per_unified_identity enforces one MERCHANT per person
- Profile sync treats MERCHANT like other person roles
- go_delivery.merchants has user_id → User; name is business name (separate from User.full_name)

---

## Auth Context: Current vs Future

### Current

| Aspect | Implementation |
|--------|----------------|
| **JWT scope** | User(MERCHANT).id in `sub`; account_type = MERCHANT |
| **Lookup** | By phone + account_type; or findByUnifiedIdentityIdAndAccountType |
| **Context** | Single operator; merchants.user_id = sole operator |
| **Display name** | Prefer go_delivery.merchant.name when available; fallback to User.full_name |

### Future (MerchantOrganization)

| Aspect | Target |
|--------|--------|
| **JWT scope** | May include organization_id, operator role (OWNER, MANAGER, OPERATOR) |
| **Context** | Multiple operators per organization; JWT resolves "current merchant context" |
| **Auth flow** | Identity-first: resolve identity → User(MERCHANT) or MerchantUser → organization |

**Implementation guidance:** Keep auth logic behind `account_type === 'MERCHANT'` and role-category helpers (isPersonRole, BUSINESS_CAPABLE_ROLES). When adding MerchantOrganization, introduce optional organization_id in JWT and resolve operator context without breaking current User(MERCHANT) flow.

---

## Target Model (Future)

```
MerchantOrganization
  - id, legal_name, tax_id, registration_number
  - Many branches (MerchantBranch)
  - Many operators (MerchantUser: OWNER | MANAGER | OPERATOR)

MerchantBranch
  - organization_id, address, opening_hours

MerchantUser
  - organization_id, user_id (UnifiedIdentity/User), role
```

---

## Migration-Friendly Path

### Phase 1 (Current)
- MERCHANT remains person-scoped; one User(MERCHANT) per identity
- JWT scoped to User(MERCHANT)

### Phase 2
- Add merchant_organizations; go_delivery.merchants.organization_id nullable
- Legacy: organization_id IS NULL, user_id = operator

### Phase 3
- Add merchant_users; branches
- Drop uniq_merchant_per_unified_identity when multi-merchant-per-person needed
- JWT: organization_id, role

---

## Design Principles

1. **Avoid over-coupling MERCHANT to person semantics** – Use merchant.name for business display; branch logic via isPersonRole().
2. **Ownership** – Today: merchants.user_id = owner. Future: merchant_users.role = OWNER.
3. **Operators** – Future: merchant_users with OWNER | MANAGER | OPERATOR.
4. **Branches** – Future: merchant_branches; orders reference branch_id.

---

## Code Guidance

| Area | Current | Evolution-Safe |
|------|---------|----------------|
| Role lists | ROLE_TYPES includes MERCHANT | Branch via isPersonRole(), roleUsesConsumerForPayout() |
| Display name | user.full_name | Prefer merchant.name when available |
| Auth | User(MERCHANT) JWT | Keep; add organization_id when ready |
| Payout | MERCHANT has own wallet | No consumer link; different model |
