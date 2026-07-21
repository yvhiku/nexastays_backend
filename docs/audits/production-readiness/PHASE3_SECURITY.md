# Phase 3 — Security + Authorization Ownership

**Score: 8.0/10**

## Auth model asymmetry (critical)

| Service | Pattern | Risk |
|---------|---------|------|
| Stays | Global `JwtAuthGuard` + `@Public()` | Secure by default |
| Identity | Opt-in `@UseGuards(JwtAuthGuard)` per route | **Any new route without guard is public** |

## Launch blockers

| ID | Finding |
|----|---------|
| SEC-001 | Identity lacks global JWT guard |
| SEC-002 | Payment webhook duplicate processing — no intent row lock in txn (`stays-payments.service.ts:153-155`) |
| SEC-003 | Localhost/dev-secret fallbacks when env unset in prod (`cmi-payment.provider.ts`, `messaging-media.service.ts:19,27`) |
| SEC-004 | `INTERNAL_SERVICE_KEY` dev fallback if mis-deployed |

## Ownership matrix (sample — full list in audit)

| Endpoint | Resource | Owner check | Verified |
|----------|----------|-------------|----------|
| GET /stays/bookings/:id | booking | guest OR host | YES |
| POST /stays/bookings/:id/cancel | booking | guest OR host + role match | YES |
| GET /messaging/conversations/:id | conversation | `isParticipant()` | YES |
| POST /messaging/conversations/:id/messages | conversation | participant + not blocked | YES |
| GET /stays/payments/intents/:id | intent | guest owns booking | YES (BOLA spec) |
| GET /messaging/media/signed/* | attachment | HMAC only, no membership | BY DESIGN — URL leak risk |
| GET /stays/calendar/:token | calendar | token secret | BY DESIGN |
| POST /users | user create | @Public + throttle | MEDIUM — intentional |
| GET /snapshots/me | snapshot | JWT only (no OtpSessionResolver) | MEDIUM — session token confusion |
| admin/stays/* | admin ops | @Roles('ADMIN') | YES |

## Session token confusion (MEDIUM)

`identity_session` JWT uses `sub: sessionToken` not userId. Routes with `JwtAuthGuard` only (no `OtpSessionResolverGuard`):

- `GET users/me/profile-photo`
- `GET snapshots/me`

## Positive signals

- Messaging returns 404 for non-participants (no enumeration)
- CMI webhook HMAC fail-closed
- Mock payment webhook disabled in production
- BOLA specs: listings, payments, financial-integrity, mass-assignment

See [OWNERSHIP_MATRIX.md](./OWNERSHIP_MATRIX.md) for endpoint checklist template.
