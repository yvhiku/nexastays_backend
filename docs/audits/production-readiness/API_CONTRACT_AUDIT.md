# API Contract Audit (Phase 6.5)

**Score: 8.5/10** — Client shims compensate for most drift.

## Trace chain

```
Controller → DTO → (Swagger) → nexastays_web/lib/*-api.ts → Components
```

## Confirmed drift

| ID | Domain | Backend | Frontend | Severity | Mitigation |
|----|--------|---------|----------|----------|------------|
| API-001 | Host verification | Multiple status fields (`status`, `application_status`, `host_verification_status`) | `normalizeHostVerificationStatus()` in stays-api.ts:861-903 | Medium | Client shim — document canonical field |
| API-002 | Notifications | `{ data: items }` without envelope header | notifications-api unwrap | Low | Works |
| API-003 | Booking guest view | Omits `host_fee` for guests | StaysBooking type requires host_fee | Low | Type lie only |
| API-004 | verifyPin | Returns refresh_token, expires_in | auth-api types partial | Low | Unused fields |
| API-005 | Header state | Flat `{ notificationCount, inboxCount, avatar, hostMode }` | header-api matches | OK | — |

## Aligned contracts

| Domain | Backend | Frontend client |
|--------|---------|-----------------|
| Messaging inbox | `ConversationListResponse[]` | messages-api.ts unwrap |
| Conversation detail | `bookingStatus` snake_case in JSON | messages-api.ts maps |
| Booking lifecycle | `booking_lifecycle` + `status` | booking-lifecycle.ts prefers lifecycle |
| Notifications | `is_read`, `created_at`, `action_url` in data | notifications-api.ts |

## Missing contract tests

No automated OpenAPI ↔ TypeScript client diff. **Recommend:** P1 add contract test for top 5 flows (auth, booking, pay, messaging, notifications).

## Pilot recommendation

Next booking/payment UI change: run field-by-field diff against `stays-api.ts` types before merge.
