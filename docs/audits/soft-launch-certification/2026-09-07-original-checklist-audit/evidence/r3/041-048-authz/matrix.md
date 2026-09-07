# Gate 3 — original checklist 041–048 authorization / BOLA

Date: 2026-09-07 (updated after AccountStatusGuard for 047)  
Actors exercised: guest/consumer, host A, host B, admin/support, suspended/frozen staff + suspended consumer (guard).

| ID | Check | Result | Evidence |
|----|-------|--------|----------|
| 041 | Guest cannot access host-only APIs | **PASS** | Intended policy: GET is auth + self-scoped (200 empty), not HOST-role gated — [host-listings-consumer-get-policy.md](./host-listings-consumer-get-policy.md). Mutations denied for unverified guest (HTTP 400). Jest: `host-listings.h17-authz.spec.ts`, `bola-listings.spec.ts`, `bola-multi-actor-matrix.spec.ts`. HTTP: [http-matrix.txt](./http-matrix.txt). |
| 042 | Host cannot access admin APIs | **PASS** | HTTP hostA/hostB → 403 on stays + identity admin. Jest RolesGuard (stays + identity). [http-matrix.txt](./http-matrix.txt), [jest.txt](./jest.txt). |
| 043 | Normal user cannot access another user's private data | **PASS** | Bookings/support/payments/listings foreign ID → 404; list endpoints bind caller userId. Jest: `bola-bookings.spec.ts`, `bola-payments.spec.ts`, support Gate3 ownership, `bola-multi-actor-matrix.spec.ts`. HTTP foreign booking 404. |
| 044 | Host cannot modify another host's listing | **PASS** | `requireOwnedListing` / H17: cross-host update/pause → NotFound, `save` not called. HTTP foreign pause → 404. Jest: `bola-listings.spec.ts`, `host-listings.h17-authz.spec.ts`. |
| 045 | Host cannot modify another host's booking | **PASS** | Cancellation party checks: foreign host/guest → NotFound, no ledger/booking mutation. Jest: `stays-cancellation.service.spec.ts`, `bola-bookings.spec.ts`. HTTP cancel foreign → 404. |
| 046 | Admin permissions are correctly enforced server-side | **PASS** | RolesGuard live authz_version + account_type ADMIN. HTTP: non-admin 403; admin listings/users 200. Jest: stays + identity `roles.guard.spec.ts`. |
| 047 | Suspended users cannot perform restricted actions | **PASS** | `AccountStatusGuard` APP_GUARD on Identity + Stays: live Identity authz denies `SUSPENDED`/`FROZEN`/`BANNED` with 401. RolesGuard also denies those statuses for staff. listing_frozen host writes still blocked. Specs: [047-jest.txt](./047-jest.txt). |
| 048 | API authorization cannot be bypassed by manipulating IDs | **PASS** | Foreign UUIDs → 404 (same as missing); query `hostId`/`host_user_id` rejected 400; support/booking/listing ownership contracts. HTTP + Jest matrix above. |

## Suites run

See [jest.txt](./jest.txt) and [047-jest.txt](./047-jest.txt).

## Frozen

Mock payments / Sumsub / SMS providers were not flipped.
