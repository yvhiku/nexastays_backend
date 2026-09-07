# Host listings GET — consumer access policy (checklist 041)

## Observation

Authenticated **CONSUMER** JWTs receive **HTTP 200** on `GET /api/v1/stays/host/listings` (and related counts/options). This was previously recorded as a role-policy FAIL in `authorization-rate-results.json`.

## Intended policy (do not “fix” with a blanket HOST role)

Nexa Stays uses a **unified account model**: the same consumer identity can become a host after verification. Host portal **read** routes are therefore:

1. **Authenticated** (`JwtAuthGuard`) — anonymous requests are rejected.
2. **Self-scoped** — the controller always passes `user.userId` into `HostListingsService.listHostListingsPage` / `getHostListings`. The list query DTO has **no** `hostId` / `host_user_id` field; unknown injection properties are rejected with **400**.
3. **Not role-gated as HOST-only** — a consumer with zero listings correctly receives `{ items: [], pagination: … }`. This is an empty **own** portal view, not cross-user disclosure.

## Mutations (host-only capability)

Write paths (`POST /host/listings`, `PATCH/pause/resume/media/…`) additionally require `HostsService.canList(userId)` (approved host, not `listing_frozen`). Unverified consumers receive **400 Host verification required** before any ownership load. Cross-host ID access on pause/detail returns **404 Listing not found** (H17 anti-enumeration) and does not mutate state.

## Evidence

- HTTP: `http-matrix.txt` (consumer GET → 200 items=0; guest POST create → 400 verification; foreign pause → 404; injected `hostId` → 400)
- Jest: `host-listings.h17-authz.spec.ts`, `bola-listings.spec.ts`, `bola-multi-actor-matrix.spec.ts`
