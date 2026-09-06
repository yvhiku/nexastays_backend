# Soft-launch operations procedures

**Environment:** dogfood (`NEXA_ENV=dogfood`)  
**Frozen:** mock payments · DEMO OTP · Sumsub sandbox  

Assign names in the sign-off table; one person may hold multiple roles during soft-launch.

## Roles

| Role | Responsibilities |
|------|------------------|
| Host approver | Approve/reject host applications |
| Listing moderator | Approve / reject / set-live / pause listings |
| KYC operator | Review sandbox KYC queue; re-sync Sumsub; escalate fraud |
| Support agent | Tickets, reports, customer replies |
| Finance ops | Manual host payouts per HOST_PAYOUT_MANUAL_SOP (no auto settlement) |
| Incident lead | Payment/booking inconsistencies; uses PAID_NO_BOOKING_TRACE |

## Procedures (minimum)

### Host approval

1. Confirm KYC verified (sandbox) or documents reviewed.  
2. Approve host application in admin.  
3. Host can create listings; cannot self-publish LIVE.

### Listing moderation

1. Review SUBMITTED listing (photos, location, pricing).  
2. Approve → set-live, or reject with reason.  
3. Host resubmits from REJECTED only.

### Payment dispute (mock)

1. Run [PAID_NO_BOOKING_TRACE.md](PAID_NO_BOOKING_TRACE.md).  
2. Do not mark CONFIRMED in SQL unless engineering dual-control.  
3. Record outcome in support ticket.

### Refund / cancel

1. Prefer product cancel/refund flows.  
2. Reconcile ledger before any manual host transfer.  
3. See [HOST_PAYOUT_MANUAL_SOP.md](HOST_PAYOUT_MANUAL_SOP.md).

### Safety / emergency

1. Open safety report / escalate ticket.  
2. Freeze listing or suspend user if immediate risk.  
3. Incident lead notified within response SLA you define (suggest 1h soft-launch).

### DEMO OTP note

Soft-launch testers may use `DEMO_OTP_CODE`. Do not share the code publicly; rotate if leaked; never enable DEMO when `NEXA_ENV=production`.

## Sign-off

| Role | Name | Contact |
|------|------|---------|
| Host approver | | |
| Listing moderator | | |
| KYC operator | | |
| Support | | |
| Finance ops | | |
| Incident lead | | |
