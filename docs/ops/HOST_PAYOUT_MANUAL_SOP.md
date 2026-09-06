# Host payout — manual SOP (soft-launch)

**Status:** authoritative while `STAYS_HOST_PAYOUT_ENABLED=false`  
**Does not** enable automated settlement or CMI host payouts.

## Model

```text
Guest mock/CMI payment
  → stays ledger: GUEST_PAYMENT (SETTLED)
  → PLATFORM_FEE + HOST_PAYOUT (PENDING)
  → manual ops settles HOST_PAYOUT outside the app (transfer)
  → (future) settlement job marks HOST_PAYOUT SETTLED
```

Soft-launch uses **mock** guest payment. Host “pending” on the dashboard is the Σ of `HOST_PAYOUT` + `PENDING` ledger rows — **not** a withdrawable wallet.

## Rules

1. Leave `STAYS_HOST_PAYOUT_ENABLED=false` until a certified settlement job exists.
2. Never promise instant payout in guest/host UI copy during soft-launch.
3. Commission = `PLATFORM_FEE` ledger rows; host share = `HOST_PAYOUT`.
4. Cancellations/refunds: reconcile `REFUND` / voided intents before any manual transfer.

## Weekly procedure

1. Export or query pending payouts:

```sql
SELECT e.id, e.booking_id, e.amount, e.currency, e.status, e.created_at, b.host_user_id
FROM stays_ledger_entries e
JOIN stays_bookings b ON b.id = e.booking_id
WHERE e.type = 'HOST_PAYOUT' AND e.status = 'PENDING'
ORDER BY e.created_at ASC;
```

2. For each row, confirm booking is `CONFIRMED` (or post-stay policy window met) and no open dispute/safety hold.
3. Pay host via the approved off-platform method (bank transfer). Record reference outside git (ops sheet).
4. After payment, either:
   - Keep status PENDING until settlement job exists, **or**
   - Ops DB update to `SETTLED` only with dual control + audit note (prefer waiting for job).
5. File the week’s batch in the ops archive (amount, host, booking ids, transfer refs).

## Refund / cancel impact

- If guest is refunded before host transfer: **do not pay** that `HOST_PAYOUT`.
- If already transferred: open clawback / net against next cycle per finance policy.

## Related

- `stays/docs/host-dashboard-api.md`
- `payment-provider.config.ts` → `isHostPayoutEnabled`
- Cert IDs: PAYOUT-001–005
