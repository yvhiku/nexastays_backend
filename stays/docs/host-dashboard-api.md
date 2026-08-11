# Host Dashboard Aggregated Data API (H3)

**Endpoint:** `GET /stays/host/dashboard`  
**Auth:** Bearer JWT (`JwtAuthGuard`). Host scope is always `user.userId` from the token — **never** a client `hostId` query/body param.  
**Preserved:** `GET /stays/host/stats` remains unchanged for existing web clients.

Upstream contracts: `nexastays_web/docs/host/H1_HOST_DASHBOARD_SPEC.md`, `H2_HOST_DASHBOARD_DATA_CONTRACT.md`.

---

## Response schema (summary)

| Block | Purpose |
| ----- | ------- |
| `as_of`, `timezone`, `currency` | Snapshot metadata (`timezone` always `Africa/Casablanca`) |
| `today.*` | Operational day KPIs |
| `earnings.*` | Gross / net / platform fees + month MoM |
| `payouts.*` | Mock/dogfood payout contract |
| `operations.*` | Upcoming check-ins |
| `inventory.*` | Listings + occupancy (+ `occupancy_basis`) |
| `reviews.*` | Rating summary (`listHostReviews`) |
| `messaging.*` | Always `unread_count: null`, `status: "unavailable"` |
| `calendar_status`, `listing_health` | Calendar sync + listing readiness |
| `bookings_summary` | Counts by status class |

Swagger DTO: `HostDashboardAggregateDto`.

---

## KPI definitions

### Today (`Africa/Casablanca` calendar day)

| Field | Definition |
| ----- | ---------- |
| `checkins_today` | `CONFIRMED` \| `CHECKED_IN` with check-in date = today |
| `checkouts_today` | `CONFIRMED` \| `CHECKED_IN` \| `COMPLETED` with checkout date = today |
| `checkouts_tomorrow` | Same statuses, checkout = tomorrow |
| `currently_staying` | Stay statuses with `checkin ≤ today < checkout` |
| `new_bookings_today` | Any booking with `created_at` falling on Casablanca today (all statuses) |
| `awaiting_guest_payment` | Lifecycle `PENDING_PAYMENT` |

### Money

Eligible earning statuses: `CONFIRMED` \| `CHECKED_IN` \| `COMPLETED`.

| Field | Formula |
| ----- | ------- |
| `gross_revenue*` | Σ `total_paid` |
| `net_host_earnings*` | Σ `payout_amount` (fallback: `max(0, total_subtotal − host_fee)`) |
| `platform_fees*` | Σ `guest_fee + host_fee` |

**Month attribution:** Casablanca calendar month of `confirmed_at ?? created_at`.  
**`this_month.mom_pct`:** percent change of **net host earnings** vs previous Casablanca month (`null` if previous ≤ 0).  
**`upcoming_revenue_30d`:** net payout of `CONFIRMED` \| `CHECKED_IN` with check-in in `[today, today+30)` Casablanca days.

### Occupancy

`occupancy_basis = "BOOKED_OVER_CAPACITY_V1"`:

```
booked nights in month / (days_in_month × max(live_listings, 1))
```

Availability blocks and external busy periods are **not** in the denominator (H2 option B).

### Payouts (mock / dogfood)

| Field | Value |
| ----- | ----- |
| `provider` | `STAYS_PAYMENT_PROVIDER` (default `mock`) |
| `mode` | Stage-aware (`dogfood` / `staging_mock` / `mock` / stage name) |
| `pending` | Σ ledger `HOST_PAYOUT` + `PENDING` for this host |
| `available` | Always `0` (no wallet) |
| `paid_out` | Σ ledger `HOST_PAYOUT` + `SETTLED` (typically `0` — no settlement job yet) |
| `disclaimer` | Required string stating simulation / no wallet when mock |

### Messaging

No cross-module coupling: `unread_count` is always `null`, `status` is `"unavailable"`.

---

## Timezone

All dashboard “today / month / +30d” boundaries use **`Africa/Casablanca`** via Luxon helpers in `host-dashboard-timezone.ts`.  
`GET /stays/host/stats` retains process-local day math for backward compatibility.

---

## Known limitations / H2 deviations

1. In-memory aggregation over the host’s bookings (same pattern as `/host/stats`); SQL rollups deferred.
2. Occupancy v1 ignores blocks (documented via `occupancy_basis`).
3. No real payout wallet, CMI settlement, or `available` balance.
4. Per-listing property performance is on `GET /stays/host/analytics` (H10 / H7) — not this dashboard.
5. Messaging unread inventing is forbidden — field is explicitly unavailable.
6. Extra vs H2 §9 shape: `earnings.previous_month` object is included for clarity; MoM remains on `this_month.mom_pct`.

---

## Implementation map

- Service: `src/modules/stays/services/host-dashboard.service.ts` → `getHostDashboard`
- TZ helpers: `src/modules/stays/services/host-dashboard-timezone.ts`
- Route: `GET host/dashboard` in `stays.controller.ts` (immediately after `host/stats`)
- Tests: `host-dashboard.service.spec.ts`
