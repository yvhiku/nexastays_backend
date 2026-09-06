# Runbook: customer paid but no booking confirmation

**Soft-launch:** guest payment is **mock** (`STAYS_PAYMENT_PROVIDER=mock`).  
Same trace shape applies later to CMI webhooks (PublicCutover).

## Goal

Answer “I paid / confirmed payment but my booking is not confirmed” without random container SSH.

## Trace order

### 1. Identify booking

From customer: phone/email, approximate time, listing title, or `booking_reference`.

```sql
SELECT id, booking_reference, status, listing_id, guest_user_id,
       checkin_date, checkout_date, created_at, updated_at
FROM stays_bookings
WHERE booking_reference = $1
   OR guest_user_id = $2
ORDER BY created_at DESC
LIMIT 20;
```

### 2. Payment intent

```sql
SELECT id, booking_id, provider, status, provider_intent_id,
       amount, currency, created_at, updated_at
FROM stays_payment_intents
WHERE booking_id = $1
ORDER BY created_at DESC;
```

| Intent status | Booking status | Meaning |
|---------------|----------------|---------|
| PENDING | PAYMENT_PENDING / INITIATED | Confirm never completed — ask guest to retry mock confirm / checkout |
| SUCCEEDED | CONFIRMED | Success path; if UI stale → cache/CDN or wrong account |
| SUCCEEDED | not CONFIRMED | **Investigate confirm TX failure** — see step 3–4 |
| FAILED / expired | expired hold | Dates may be free; create new booking |

### 3. Ledger

```sql
SELECT id, type, status, amount, currency, created_at
FROM stays_ledger_entries
WHERE booking_id = $1
ORDER BY created_at;
```

Expect on success: `GUEST_PAYMENT` SETTLED + `PLATFORM_FEE` + `HOST_PAYOUT` PENDING.  
Invariant: guest amount ≈ host_payout + platform_fee (`financial-observability.ts`).

### 4. Application logs

Search stays logs by `booking_id` / intent id around confirm time:

- Mock: `POST` mock-confirm / internal confirm  
- Conflicts: availability re-check → hold expired + `PAYMENT_REFUND_REQUIRED` style alert  
- Idempotent replay: second confirm should no-op if already SUCCEEDED

### 5. Fix patterns (soft-launch)

| Finding | Action |
|---------|--------|
| Intent PENDING | Guest re-run mock confirm; do not hand-edit CONFIRMED |
| Intent SUCCEEDED, booking not CONFIRMED | Engineering: inspect failed TX; prefer re-running safe confirm path over raw SQL |
| Double booking conflict on confirm | Explain dates lost; refund/mock reverse; help rebook |
| UI shows old state | Hard refresh; verify JWT user matches `guest_user_id` |

### 6. KYC companion (host permissions)

If issue is “host cannot list after KYC”:

```text
Sumsub webhook → identity kyc_profiles.status
  → stays host snapshot / host_verification_status
  → canList (APPROVED application + verification)
```

Admin: KYC drawer re-sync; confirm host application not frozen.

## Related cert IDs

OBS-001, OBS-002, PAY-003, PAY-004, BOOK-008, OPS-004
