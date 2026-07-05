# Driver Onboarding with Unified Identity

## Overview

Driver (and Courier) onboarding in the Nexa Driver App is adapted to use Unified Identity, reusable KYC, and profile sync. This document describes how the four architecture phases work together in the registration flow.

## Related Architecture Docs

| Doc | Phase | Purpose |
|-----|-------|---------|
| [unified-identity-architecture.md](./unified-identity-architecture.md) | 1 | One phone = one identity; User.unified_identity_id |
| [reusable-kyc-architecture.md](./reusable-kyc-architecture.md) | 2 | Reuse identity verification across services |
| [profile-sync-architecture.md](./profile-sync-architecture.md) | 3 | Shared vs service-specific fields, conflict rules |
| This doc | 4 | Driver/Courier registration flow integration |

## End-to-End Flow

1. **OTP verify** – User enters phone, receives OTP, verifies. Optional `registration_role` (driver|courier) is sent; backend returns `nexa_profile` (from UnifiedIdentity / getNexaProfileByPhone) and `kyc_reuse` (from KycReuseService.useExistingKyc).
2. **Registration flow** – Mobile app receives `kyc_reuse`:
   - If `can_skip_identity_step`: skip Identity step, show “We found your verified Nexa identity.”
   - If `require_step_up_verification`: show “You only need to complete the extra requirements for this service.”
3. **Identity reuse** – User submits with `identity_reused=true` when applicable; backend skips identity file upload for courier when identity is reused.
4. **Profile sync** – Shared fields (name, DOB, email, etc.) propagate via ProfileSyncService; service-specific data (vehicle, license) remains per-role.

## Backend Integration

| Flow | Integration |
|------|-------------|
| Auth OTP verify | `registration_role` → `KycReuseService.useExistingKyc` → `kyc_reuse` in response |
| Registration submit | `identity_reused` accepted; identity files optional when reused |
| Profile update | `ProfileSyncService.updateSharedProfile` when `unified_identity_id` exists |

## Mobile Integration

- `AuthService.verifyOtp`: passes `registrationRole`, receives `kycReuse`
- `RegistrationFlow`: uses `kycReuse` to decide Identity step visibility and banners
- Prefill: uses `nexa_profile` when `canPrefillIdentityReadonly` is true
