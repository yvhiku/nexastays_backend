# Notifications 085–086 / 096–100 — PASS after inbox cast fix

Patch: `n.event_id::text = :eventId` in notification-inbox (repo + VPS dist hotpatch).

Mock journey booking `2999179b-…`:
- intent + mock-confirm → BOOKING_CONFIRMED, HOST_NEW_BOOKING, PAYMENT_RECEIVED
- guest cancel → BOOKING_CANCELLED, HOST_BOOKING_CANCELLED
- messaging message → MESSAGE_RECEIVED

Evidence: `085-100-delivery-pass.txt`
