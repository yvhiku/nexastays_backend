# Host Analytics API (H10)

**Endpoint:** `GET /stays/host/analytics`  
**Auth:** Bearer JWT (`JwtAuthGuard`). Host scope is always `user.userId` from the token — **never** a client `hostId` query/body param.  
**Upstream audit:** `nexastays_web/docs/host/H7_HOST_PROPERTY_PERFORMANCE_AUDIT.md` (locked: **CREATE `/stays/host/analytics`**).

Related surfaces (unchanged by H10):

| Endpoint | Role |
| -------- | ---- |
| `GET /stays/host/dashboard` | H3 ops + money snapshot |
| `GET /stays/host/stats` | Legacy flat KPIs |
| `GET /stays/host/reviews` | H8/H9 published review reading |

---

## Query parameter

| Param | Values | Default |
| ----- | ------ | ------- |
| `period` | `this_month` \| `previous_month` \| `all_time` \| `next_30d` | `this_month` |

Invalid `period` → `400 Bad Request`.

All period boundaries use **`Africa/Casablanca`** (`host-dashboard-timezone.ts`).

| Period | `period.start` / `end_exclusive` | Earnings attribution | Occupancy day count |
| ------ | -------------------------------- | -------------------- | ------------------- |
| `this_month` | Casablanca calendar month | `confirmed_at ?? created_at` in month | days in month |
| `previous_month` | Previous Casablanca month | same | days in previous month |
| `all_time` | `1970-01-01` … `9999-01-01` | all earning bookings | **null** occupancy value |
| `next_30d` | `[today, today+30)` | check-in in window; statuses `CONFIRMED` \| `CHECKED_IN` | 30 |

---

## Response contract (H7)

```json
{
  "as_of": "2026-08-11T11:00:00.000Z",
  "timezone": "Africa/Casablanca",
  "currency": "MAD",
  "period": {
    "id": "this_month",
    "start": "2026-08-01",
    "end_exclusive": "2026-09-01"
  },
  "eligible_booking_statuses": ["CONFIRMED", "CHECKED_IN", "COMPLETED"],
  "properties": [
    {
      "listing_id": "uuid",
      "title": "string",
      "city": "string",
      "status": "LIVE",
      "bookings": {
        "total": 0,
        "payment_pending": 0,
        "upcoming": 0,
        "current": 0,
        "completed": 0,
        "cancelled": 0
      },
      "nights": { "booked_in_period": 0 },
      "earnings": {
        "gross_revenue": 0,
        "net_host_earnings": 0,
        "platform_fees": 0,
        "upcoming_revenue_30d": 0
      },
      "occupancy": {
        "value": 0,
        "basis": "BOOKED_NIGHTS_OVER_PERIOD_DAYS_V1"
      },
      "reviews": { "avg_rating": null, "total_reviews": 0 },
      "operations": {
        "checkins_today": 0,
        "checkouts_today": 0,
        "next_checkin_date": null,
        "upcoming_bookings": 0,
        "currently_staying": 0
      },
      "payouts": { "pending": 0, "paid_out": 0 },
      "health": {
        "completion_percentage": 0,
        "photos_complete": false,
        "calendar_status": "NONE",
        "missing": [],
        "attention": []
      }
    }
  ]
}
```

Swagger DTO: `HostAnalyticsResponseDto`.

---

## Money formulas (identical to H3)

Eligible earning statuses: `CONFIRMED` \| `CHECKED_IN` \| `COMPLETED`.

| Field | Formula |
| ----- | ------- |
| `gross_revenue` | Σ `total_paid` |
| `net_host_earnings` | Σ `payout_amount` else `max(0, total_subtotal − host_fee)` |
| `platform_fees` | Σ `guest_fee + host_fee` |

`PAYMENT_PENDING` / cancelled / expired statuses do **not** enter earnings.

`upcoming_revenue_30d` (per property): net for `CONFIRMED` \| `CHECKED_IN` with check-in ∈ `[today, today+30)` Casablanca — same as H3, independent of selected period.

---

## Occupancy

Property occupancy is **BOOKED_NIGHTS_OVER_PERIOD_DAYS_V1**. It is not true available-night occupancy and does not use availability blocks or external calendar busy periods.

```
occupancy.value = booked_nights_in_period / period_days * 100
```

- Booked nights = earning-status stays, nights of `[checkin, checkout)` overlapping the period window (for `all_time`: full stay nights).
- Denominator = Casablanca calendar days in the period (`null` occupancy value for `all_time`).
- Do **not** use host `BOOKED_OVER_CAPACITY_V1` (days × live listings).

---

## Reviews

From listing denormalized columns only:

- `avg_rating`
- `review_count` → response field `reviews.total_reviews`

Does **not** call `GET /stays/host/reviews` or join review text.

---

## Listing health

Reuse `HostListingsService.getHostListings` completion payload + one calendars `In(listingIds)` query.

Attention flags (examples): `CALENDAR_ERROR`, `INCOMPLETE_LIVE`, `PAUSED`, `DRAFT`, `REJECTED`, `PAYMENT_PENDING` — no composite score.

---

## Host isolation

Listings: `host_user_id = JWT userId`.  
Bookings: `listing_id IN (those ids)`.  
Ledger payouts: join booking → listing with same host filter.

Cross-host leakage is a P0 defect.

---

## Performance limitations

In-memory aggregation after:

1. One listings query (includes rating denorm)  
2. One bookings query  
3. One calendars query  
4. One listings completion load (`getHostListings`)  
5. One ledger query grouped by listing  

No Redis, no materialized views, no per-listing N+1 booking queries.

---

## Explicit non-goals

- Frontend `/host/analytics` UI (H11)  
- ADR / RevPAR / charts / forecasting  
- Availability-block occupancy rewrite  
- Review replies / unread  
- Wallet / CMI settlement changes  
- Changing `/dashboard`, `/stats`, or `/reviews` contracts  
- Client `hostId`

---

## Implementation map

- Service: `src/modules/stays/services/host-analytics.service.ts`
- DTO: `src/modules/stays/dto/host-analytics.dto.ts`
- Route: `GET host/analytics` in `stays.controller.ts` (adjacent to `host/dashboard`)
- TZ helpers: `host-dashboard-timezone.ts` (`bookedNightsInHalfOpenRange`, `stayNights`)
- Tests: `host-analytics.service.spec.ts`
