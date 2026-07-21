# Authorization Ownership Matrix

Per-endpoint: **Can User A access User B's resource?**

Legend: ✅ verified in service | ⚠️ partial | ❌ missing | 🔓 public by design

## Stays — Bookings & payments

| Method | Path | Check | Status |
|--------|------|-------|--------|
| POST | /stays/bookings | Authenticated guest + KYC | ✅ |
| GET | /stays/bookings/:id | guest_user_id OR host | ✅ |
| POST | /stays/bookings/:id/cancel | actor matches cancelled_by role | ✅ |
| POST | /stays/payments/intents | guest owns booking | ✅ |
| POST | /stays/webhooks/payments/cmi | HMAC signature | ✅ |
| POST | /stays/webhooks/payments/mock | Disabled in prod | ✅ |

## Stays — Listings & host

| Method | Path | Check | Status |
|--------|------|-------|--------|
| GET | /stays/listings/:id | Public if LIVE | 🔓 |
| PATCH | /stays/host/listings/:id | host_user_id | ✅ |
| GET | /stays/host/* | host profile match | ✅ |

## Messaging

| Method | Path | Check | Status |
|--------|------|-------|--------|
| GET | /messaging/conversations | Filter by guest OR host user_id | ✅ |
| GET | /messaging/conversations/:id | isParticipant | ✅ |
| POST | /messaging/conversations/:id/messages | participant + rate limit | ✅ |
| GET | /messaging/media/* | Signed URL HMAC | ⚠️ URL leak vector |

## Identity — Users

| Method | Path | Check | Status |
|--------|------|-------|--------|
| GET | /users/me/* | @CurrentUser userId | ✅ |
| PATCH | /users/me/profile | userId scoped | ✅ |
| GET | /users/me/notifications | user_id filter | ✅ |
| POST | /users | @Public create | 🔓 |
| GET | /internal/users/* | InternalServiceGuard | ✅ |

## Admin

| Method | Path | Check | Status |
|--------|------|-------|--------|
| ALL | /admin/stays/* | JwtAuthGuard + RolesGuard ADMIN | ✅ |
| ALL | /admin/* (identity) | JwtAuthGuard + RolesGuard ADMIN | ✅ |

## Gaps to close (P0/P1)

| ID | Endpoint area | Gap |
|----|---------------|-----|
| OWN-M-001 | Identity new routes | No global guard — manual review each PR |
| OWN-M-002 | snapshots/me, profile-photo | Session JWT may wrong subject |
| OWN-M-003 | Signed media URLs | No conversation membership at serve time |
