# Nexa Stays Production Readiness Runbook

This runbook captures the operational controls required before public payment traffic.

## Launch Gates

- Payments: CMI payment intent, redirect, callback, refund-required alert, and failed-payment retry paths verified end to end.
- Secrets: no `DEMO_OTP_CODE`, mock payment provider, dev DB password, or wildcard production CORS origin.
- Monitoring: errors, latency, booking creation, payment success, payment failure, and refund-required alerts connected to an on-call channel.
- Backups: Identity and Stays databases have automated backups, retention, and a tested restore drill (measure RTO/RPO).
- Email: SPF, DKIM, DMARC, bounce handling, delivery monitoring, and retry policy configured for booking/host notifications.
- CI: pull requests must pass lint, typecheck, tests, build, gitleaks, and dependency audit for web, Stays, and Identity.
- **Security:** complete [PRE_LAUNCH_SECURITY.md](./PRE_LAUNCH_SECURITY.md) — Phase 0 inventory, BOLA/financial suites green, nmap clean, Phase 6 attack sim scorecard with no open Critical/High.

## Rate-Limit Budgets

Keep the existing Nest throttler defaults, then verify route-level limits before launch:

| Surface | Target control |
| --- | --- |
| OTP send | Per phone + IP, short burst and daily cap |
| OTP verify / login | Per account + IP, lockout after repeated failures |
| Search | IP-based burst limits plus bot user-agent guard |
| Booking create | Auth user + IP, sensitive-write throttle |
| Payment intent | Auth user + booking idempotency; one pending intent per booking |
| Reviews | Auth user + booking; duplicate review protection |
| Contact / support | IP + account throttle and spam heuristics |
| Uploads | Size, magic-byte MIME validation, per-account/day caps |

## Fraud And Abuse Signals

Start with alerts/manual review for:

- Many pending holds from one user, IP, device, listing, or card fingerprint.
- Repeated failed payments or refund-required events.
- Disposable email domains, suspicious phone reuse, or high-risk geographies.
- Host listings with repeated rejection, duplicate images, impossible prices, or suspicious address patterns.
- Review spam, excessive upload attempts, or scraping-like search pagination.

## Observability

Every public request should carry or receive a request id. Dashboards must include:

- API latency, 4xx/5xx rate, and throttled request count.
- Booking funnel: search, listing view, booking start, booking created, payment intent, payment success.
- Host funnel: host start, application submitted, approved/rejected, first listing submitted, first booking.
- Payment operations: webhook received, CMI signature failures, refund-required ledger entries, stale pending holds.
- Infrastructure: database CPU/connections/replication lag, disk, Redis, worker/scheduler health.

## Backup And Disaster Recovery

- Nightly full backups and point-in-time recovery for Identity and Stays.
- Retain daily backups for 30 days and monthly backups for 12 months.
- Test restore into an isolated environment before launch and at least monthly.
- Document RPO/RTO targets and the owner who can execute restore.

## Email Reliability

- Configure SPF, DKIM, and DMARC before production sender domains are used.
- Track delivery, bounce, complaint, and unsubscribe events.
- Retry transient provider errors with backoff; do not retry permanent bounces.
- Alert on booking confirmation, cancellation, or payment emails stuck beyond five minutes.

## Payment Incident Procedure

When a `PAYMENT_REFUND_REQUIRED` alert fires:

1. Confirm the CMI transaction in the provider dashboard.
2. Verify the booking is `EXPIRED` and a pending `REFUND` ledger entry exists.
3. Issue or schedule the refund through the payment provider.
4. Mark the ledger entry settled after provider confirmation.
5. Contact the guest with the booking id and refund reference.
