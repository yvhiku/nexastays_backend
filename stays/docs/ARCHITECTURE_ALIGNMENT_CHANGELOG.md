# Architecture Alignment Changelog

Summary of improvements from the unified account system architecture-alignment pass.

---

## Documentation Updates

### unified-account-system.md
- Added **terminology** table (identity, verified login identifier, service account, identity verification vs service onboarding)
- Clarified **identity_phone_numbers as canonical** phone source; legacy fields marked transitional
- Clarified **uniq_consumer_per_unified_identity** as primary business invariant; uniq_consumer_per_phone as transitional
- Marked **linked_services** as derived, non-authoritative
- Added **Data Ownership** section (canonical sources)
- Expanded **Auth flow** with identity-aware PIN verify description
- Expanded **HOST lifecycle** (identity reuse, host approval, listing approval)
- Added **MERCHANT auth context** (current vs future)
- Added **Retirement roadmap** reference

### unified-account-retirement-roadmap.md (NEW)
- Deprecation notes for unified_identities.phone_number, users.phone_number, linked_user_id, linked_services, kyc_status
- linked_user_id removal path
- Auth: phone-first vs identity-first migration
- Retirement phases

### unified-account-constraints.md
- Constraint hierarchy: business invariants vs transitional
- Clarified one CONSUMER per identity as primary invariant; per-phone as transitional

### unified-account-concurrency-hardening.md
- Terminology alignment (identity_phone_numbers canonical, uniq_consumer_per_unified_identity primary)

### reusable-kyc-architecture.md
- Emphasized identity verification separate from service onboarding
- Added status domains reference
- Trimmed redundancy

### merchant-business-entity-evolution.md
- **Auth context: current vs future** – JWT scope, lookup, implementation guidance
- Tightened code guidance

### host-account-architecture.md
- **HOST lifecycle separated** – identity reuse, host application approval, listing approval
- Clarified that listing approval is separate from host approval

### kyc-onboarding-status-domains.md
- No structural changes; referenced from other docs

---

## Entity Comment Updates

### UnifiedIdentity
- phone_number: marked TRANSITIONAL, canonical source identity_phone_numbers
- linked_services: marked derived, non-authoritative

### User
- phone_number: clarified transitional; canonical in identity_phone_numbers
- linked_user_id: @deprecated with retirement roadmap ref

### IdentityPhoneNumber
- Clarified as canonical source of verified login identifiers

---

## Terminology Clarifications

| Before | After |
|--------|-------|
| "One phone = one identity" | Identity is keyed by id; phones are verified login identifiers in identity_phone_numbers |
| linked_services as data | linked_services derived, non-authoritative |
| uniq_consumer_per_phone as primary | uniq_consumer_per_unified_identity primary; per-phone transitional |
| linked_user_id for payout | getConsumerForIdentity(unified_identity_id); linked_user_id deprecated |

---

## Unresolved Implementation Gaps

1. **Auth: identity-first PIN verify** – Current verifyPin looks up User by phone + account_type. Target: resolve identity via findIdentityByPhone first, then User by unified_identity_id + account_type. Add findAccountsByIdentity(identityId).
2. **findAccountsByPhone / findConsumerByPhone** – Currently query users.phone_number. Target: resolve identity via identity_phone_numbers first when possible; then users by unified_identity_id.
3. **identity_phone_numbers migration** – Resolved: 026_identity_phone_numbers added to run-migrations.sh (after 025, before 026_one_consumer_per_identity). Creates table, backfills from unified_identities and users, deprecates unified_identities.phone_number.
4. **OTP session storage** – otp_sessions.phone_number; consider storing unified_identity_id when identity is resolved for consistency.
