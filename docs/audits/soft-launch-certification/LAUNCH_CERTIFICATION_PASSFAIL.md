# Nexa Stays Soft-Launch Certification — PASS/FAIL

Status: authoritative for **dogfood soft-launch**  
Last updated: 2026-09-06  
Frozen posture (do **not** change during this cert):

| Integration | Value |
|-------------|--------|
| Payments | `STAYS_PAYMENT_PROVIDER=mock` |
| OTP | `DEMO_OTP_CODE` allowed when `NEXA_ENV=dogfood` |
| KYC | `SUMSUB_MODE=sandbox` |

**Tag**

- **SoftLaunch** — execute now under dogfood/mock/DEMO/sandbox  
- **PublicCutover** — document only; do not execute or flip env until explicitly requested  

**Result values:** `PASS` | `FAIL` | `BLOCKED` | `N/A` | `NOT_RUN`

Fill **Result** / **Evidence** on the scorecard run. Cross-links to existing automation are in the Evidence column.

Related: [LAUNCH_CERTIFICATION_SCORECARD.md](LAUNCH_CERTIFICATION_SCORECARD.md) · [PRODUCTION_READINESS_CHECKLIST.md](PRODUCTION_READINESS_CHECKLIST.md) · [smoke-dogfood-checklist.md](../../../deploy/scripts/smoke-dogfood-checklist.md) · [smoke.sh](../../../deploy/scripts/smoke.sh)

---

## 1. Payments (mock SoftLaunch; CMI PublicCutover)

| ID | Tag | Area | Precondition | Steps | Expected | Evidence / automation |
|----|-----|------|--------------|-------|----------|------------------------|
| PAY-001 | SoftLaunch | Payments | Dogfood env | Confirm `STAYS_PAYMENT_PROVIDER=mock` in stays env | mock only | `deploy/env/dogfood.stays.env.example`; `payment-provider.config.ts` |
| PAY-002 | SoftLaunch | Payments | Guest + LIVE listing | Create booking → payment intent | Intent PENDING; provider mock | smoke #10; `mock-payment-confirm.spec.ts` |
| PAY-003 | SoftLaunch | Payments | Intent exists | Mock confirm (JWT) | Booking CONFIRMED; ledger GUEST_PAYMENT | smoke #11–12; `mock-payment-confirm.spec.ts` |
| PAY-004 | SoftLaunch | Payments | Already SUCCEEDED intent | Confirm again | Idempotent success; no double ledger | `stays-payments.service.ts` FOR UPDATE; mig `034` |
| PAY-005 | SoftLaunch | Payments | HOLD booking | Abandon without confirm; wait expiry cron | Hold expires; dates free | `BOOKING_STATE_MACHINE.md`; expiry paths |
| PAY-006 | SoftLaunch | Payments | Confirmed booking | Cancel + mock refund path | REFUND ledger / status consistent | smoke #13–14 |
| PAY-007 | SoftLaunch | Payments | Admin | View payment/booking in admin | Transaction visible | admin stays booking APIs |
| PAY-008 | SoftLaunch | Payments | Config | `STAYS_HOST_PAYOUT_ENABLED` unset/false | Payout settlement off | `payment-provider.config.spec.ts` |
| PAY-009 | SoftLaunch | Payments | Confirm success | Ledger identity: guest = host_payout + fee | Financial invariant holds | `financial-observability.ts` |
| PAY-010 | PublicCutover | Payments | CMI credentials | Live PreAuth redirect | Out of scope soft-launch | `cmi-payment.provider.ts` |
| PAY-011 | PublicCutover | Payments | CMI | HMAC callback verify | Out of scope soft-launch | `verifyCallback` |
| PAY-012 | PublicCutover | Payments | CMI | Duplicate/late webhook | Out of scope soft-launch | — |

---

## 2. KYC / Sumsub

| ID | Tag | Area | Precondition | Steps | Expected | Evidence / automation |
|----|-----|------|--------------|-------|----------|------------------------|
| KYC-001 | SoftLaunch | KYC | Dogfood | Confirm `SUMSUB_MODE=sandbox` | sandbox | `deploy/env/dogfood.env.example` |
| KYC-002 | SoftLaunch | KYC | Sumsub configured | Webhook secret present | Boot requires secret | `main.ts` / `assertIdentityProductionEnvPolicy` |
| KYC-003 | SoftLaunch | KYC | Sandbox applicant | Complete sandbox flow | Status syncs to Identity | compliance webhook |
| KYC-004 | SoftLaunch | KYC | Webhook HMAC | Invalid digest | 400 | `compliance.service.ts` |
| KYC-005 | SoftLaunch | KYC | Valid webhook | Deliver reviewed event | KYC profile updated | compliance controller |
| KYC-006 | SoftLaunch | KYC | Admin | Open KYC drawer + re-sync | Dossier fields + media | dashboard `KycDrawer` |
| KYC-007 | SoftLaunch | KYC | Host apply | Verified KYC or uploads | Host apply allowed | `host-onboarding.service.ts` |
| KYC-008 | SoftLaunch | KYC | Guest book | Guest KYC policy | Booking gated per policy | `StaysKycPolicyService` |
| KYC-009 | SoftLaunch | KYC | Rejection | Reject + retry | Host can resubmit path | admin KYC reject |
| KYC-010 | PublicCutover | KYC | Live Sumsub | `SUMSUB_MODE=live` | Deferred | `check-env.sh` prod gate |

---

## 3. OTP / verification

| ID | Tag | Area | Precondition | Steps | Expected | Evidence / automation |
|----|-----|------|--------------|-------|----------|------------------------|
| OTP-001 | SoftLaunch | OTP | Dogfood | Confirm DEMO OTP allowed | Code verifies without SMS | `production-env-policy.ts`; `auth.otp-contract.spec.ts` |
| OTP-002 | SoftLaunch | OTP | DEMO set | Send OTP | Session created; DEMO path | smoke #4 (adapt for DEMO) |
| OTP-003 | SoftLaunch | OTP | Valid DEMO | Verify → session | Access + refresh cookie | smoke #5–6; logout specs |
| OTP-004 | SoftLaunch | OTP | Wrong code ×5 | Attempt lockout | Locked ~15 min | `otp-lockout.service.ts` |
| OTP-005 | SoftLaunch | OTP | Rapid send | Rate limit send | 429 / reject | `otp-send-rate-limit.service.ts` |
| OTP-006 | SoftLaunch | OTP | Expired code | Verify late | Fail | auth.service expiry |
| OTP-007 | SoftLaunch | OTP | Logs | Grep OTP in app logs | Code never logged cleartext | manual / log review |
| OTP-008 | PublicCutover | OTP | Prod SMS | EnvoiSMS/Twilio live | Deferred | `assertProductionSmsConfigured` |

---

## 4. Booking engine

| ID | Tag | Area | Precondition | Steps | Expected | Evidence / automation |
|----|-----|------|--------------|-------|----------|------------------------|
| BOOK-001 | SoftLaunch | Booking | Explore | Search → listing | Listing loads | smoke #8 |
| BOOK-002 | SoftLaunch | Booking | Availability | Select dates/guests | Available | availability service |
| BOOK-003 | SoftLaunch | Booking | Guest | Create reservation | INITIATED/PAYMENT_PENDING | smoke #9 |
| BOOK-004 | SoftLaunch | Booking | Mock pay | Confirm | CONFIRMED | PAY-003 |
| BOOK-005 | SoftLaunch | Booking | Two clients | Concurrent same dates | One wins; other 409 / EXCLUDE | `booking-pg-concurrency.prod-inv-001.spec.ts` |
| BOOK-006 | SoftLaunch | Booking | DB | Inspect constraint | `ex_stays_bookings_active_overlap` | mig `016_booking_integrity_constraints.sql` |
| BOOK-007 | SoftLaunch | Booking | Listing lock | Concurrent creates | Serialized via FOR UPDATE | `stays.service.ts` createBooking |
| BOOK-008 | SoftLaunch | Booking | Pay confirm | Dates taken after hold | Expire hold; alert path | payments confirm re-check |
| BOOK-009 | SoftLaunch | Booking | Double mock confirm | Replay | Idempotent | PAY-004 |
| BOOK-010 | SoftLaunch | Booking | Browser close mid-pay | Resume / expire | No orphan CONFIRMED | expiry cron |
| BOOK-011 | SoftLaunch | Booking | Host cancel | Cancel confirmed | Status + notifications event | cancellation service |
| BOOK-012 | SoftLaunch | Booking | Guest cancel | Cancel + refund mock | Consistent ledger | smoke #13–14 |
| BOOK-013 | SoftLaunch | Booking | TZ boundary | Checkin/checkout edges | daterange `[)` correct | mig 016 CHECK |
| BOOK-014 | SoftLaunch | Booking | Status alignment | BOOKED_STATUSES vs EXCLUDE WHERE | Match | `booked-statuses.alignment.spec.ts` |

---

## 5. Host onboarding E2E

| ID | Tag | Area | Precondition | Steps | Expected | Evidence / automation |
|----|-----|------|--------------|-------|----------|------------------------|
| HOST-001 | SoftLaunch | Host | New phone | DEMO OTP register | Account created | OTP-003 |
| HOST-002 | SoftLaunch | Host | Sandbox KYC | Complete/verify | Identity verified | KYC-003 |
| HOST-003 | SoftLaunch | Host | Apply host | Submit application | PENDING→APPROVED (admin) | host-onboarding |
| HOST-004 | SoftLaunch | Host | Approved | Create listing draft | Draft saved | host-listings |
| HOST-005 | SoftLaunch | Host | Submit | Submit for review | SUBMITTED | host-listings submit |
| HOST-006 | SoftLaunch | Host | After LIVE | Receive mock booking | Host sees booking | host dashboard |

---

## 6. Listing moderation

| ID | Tag | Area | Precondition | Steps | Expected | Evidence / automation |
|----|-----|------|--------------|-------|----------|------------------------|
| MOD-001 | SoftLaunch | Moderation | SUBMITTED | Admin approve | APPROVED | `admin-stays.controller.ts` |
| MOD-002 | SoftLaunch | Moderation | APPROVED | Admin set-live | LIVE | set-live endpoint |
| MOD-003 | SoftLaunch | Moderation | SUBMITTED | Admin reject + reason | REJECTED | reject endpoint |
| MOD-004 | SoftLaunch | Moderation | REJECTED | Host resubmit | SUBMITTED again | host submit |
| MOD-005 | SoftLaunch | Moderation | Host API | Attempt set status LIVE | Forbidden / impossible | host-listings (no LIVE write) |
| MOD-006 | SoftLaunch | Moderation | LIVE | Admin pause/unpublish | PAUSED / not public | admin/host pause |

---

## 7. Trust & Safety

| ID | Tag | Area | Precondition | Steps | Expected | Evidence / automation |
|----|-----|------|--------------|-------|----------|------------------------|
| TS-001 | SoftLaunch | T&S | Guest | File conversation report | Ticket/report created | support-tickets |
| TS-002 | SoftLaunch | T&S | Guest | Safety report | Safety + ticket | support-tickets |
| TS-003 | SoftLaunch | T&S | Admin | List/open ticket | Detail + messages | admin support |
| TS-004 | SoftLaunch | T&S | Agent | Reply to customer | Message delivered | support message APIs |
| TS-005 | SoftLaunch | T&S | CLOSED | Customer message | Locked / reopen rules | support-ticket-state |
| TS-006 | SoftLaunch | T&S | Escalation | Escalate ticket | ESCALATED | support status |
| TS-007 | SoftLaunch | T&S | Listing report | Report listing | Visible to admin | trust reports |
| TS-008 | SoftLaunch | T&S | Suspend user | Admin suspend | Access blocked | admin users |
| TS-009 | SoftLaunch | T&S | Freeze listing | listing_frozen | Host cannot list | host-onboarding canList |
| TS-010 | SoftLaunch | T&S | Audit | Admin action | Audit log row | audit service |

---

## 8. Notifications

| ID | Tag | Area | Precondition | Steps | Expected | Evidence / automation |
|----|-----|------|--------------|-------|----------|------------------------|
| NOTIF-001 | SoftLaunch | Notif | Booking confirmed | Event published | BOOKING_CONFIRMED mapped | `notification-mapper.ts` |
| NOTIF-002 | SoftLaunch | Notif | Payment succeeded | Event | PAYMENT_SUCCEEDED | mapper |
| NOTIF-003 | SoftLaunch | Notif | Cancel | Event | BOOKING_CANCELLED guest+host | mapper |
| NOTIF-004 | SoftLaunch | Notif | Message | Event | MESSAGE_RECEIVED | mapper |
| NOTIF-005 | SoftLaunch | Notif | `PUSH_DISABLED=true` | Dispatch | Skip FCM safely | dogfood env; fcm service |
| NOTIF-006 | SoftLaunch | Notif | Email channel | Dispatch | Stub/log only → N/A delivery | `email.channel.ts` |
| NOTIF-007 | SoftLaunch | Notif | SMS channel | Dispatch | Stub/log only → N/A delivery | `sms.channel.ts` |
| NOTIF-008 | SoftLaunch | Notif | KYC/listing events | Check mapper | Not mapped → N/A product gap recorded | mapper comments |

---

## 9. Host payouts (manual)

| ID | Tag | Area | Precondition | Steps | Expected | Evidence / automation |
|----|-----|------|--------------|-------|----------|------------------------|
| PAYOUT-001 | SoftLaunch | Payout | Mock confirm | Ledger HOST_PAYOUT PENDING | Row exists | stays-payments confirm |
| PAYOUT-002 | SoftLaunch | Payout | Host dashboard | Read pending | Σ PENDING HOST_PAYOUT | host-dashboard-api.md |
| PAYOUT-003 | SoftLaunch | Payout | Flag | `STAYS_HOST_PAYOUT_ENABLED=false` | available≈0; disclaimer | host-dashboard.service |
| PAYOUT-004 | SoftLaunch | Payout | Ops | Follow manual SOP | Documented process | [HOST_PAYOUT_MANUAL_SOP.md](../../ops/HOST_PAYOUT_MANUAL_SOP.md) |
| PAYOUT-005 | SoftLaunch | Payout | Guest cancel/refund | Ledger impact | HOST_PAYOUT adjusted/consistent | cancellation + ledger |
| PAYOUT-006 | PublicCutover | Payout | Settlement job | Enable flag + certify | Deferred | payment-provider.config |

---

## 10. Legal

| ID | Tag | Area | Precondition | Steps | Expected | Evidence / automation |
|----|-----|------|--------------|-------|----------|------------------------|
| LEG-001 | SoftLaunch | Legal | Web | `/terms` | 200 + content | `app/[locale]/terms` |
| LEG-002 | SoftLaunch | Legal | Web | `/privacy` | 200 | privacy page |
| LEG-003 | SoftLaunch | Legal | Web | `/refund` | 200 | refund page |
| LEG-004 | SoftLaunch | Legal | Web | `/fees` or commission disclosure | Visible | fees page |
| LEG-005 | SoftLaunch | Legal | Ops | Moroccan legal review | Soft-launch: N/A or BLOCKED pending counsel | `docs/13-legal` |

---

## 11. Security

| ID | Tag | Area | Precondition | Steps | Expected | Evidence / automation |
|----|-----|------|--------------|-------|----------|------------------------|
| SEC-001 | SoftLaunch | Security | JWT routes | Unauth call | 401 | Identity global JWT |
| SEC-002 | SoftLaunch | Security | Host A | Access host B booking | 403/404 | BOLA audits |
| SEC-003 | SoftLaunch | Security | Admin | Non-admin admin route | 403 | RolesGuard |
| SEC-004 | SoftLaunch | Security | Refresh | Cookie HttpOnly | Not readable by JS | smoke #6 |
| SEC-005 | SoftLaunch | Security | CORS | Bad origin | Reject | smoke #20; cors-origins.spec |
| SEC-006 | SoftLaunch | Security | CSP | Response headers | CSP present | web nginx/CF |
| SEC-007 | SoftLaunch | Security | Upload | Oversize / bad type | Reject | multer limits |
| SEC-008 | SoftLaunch | Security | Profile photo path | Traversal userId | Contained under uploads/profile | users.service path checks |
| SEC-009 | SoftLaunch | Security | Secrets | Repo grep | No live secrets committed | git hygiene |
| SEC-010 | SoftLaunch | Security | Errors | Force 500 | No stack/secrets to client | nest filters |

---

## 12. Infrastructure + DR

| ID | Tag | Area | Precondition | Steps | Expected | Evidence / automation |
|----|-----|------|--------------|-------|----------|------------------------|
| INF-001 | SoftLaunch | Infra | Public URLs | HTTPS | TLS everywhere | curl -I https://… |
| INF-002 | SoftLaunch | Infra | Postgres | Port scan from public | Not exposed | compose bind 127.0.0.1 |
| INF-003 | SoftLaunch | Infra | Redis | Public | Not exposed | compose |
| INF-004 | SoftLaunch | Infra | Health | identity+stays ready | 200 | smoke #2–3 |
| INF-005 | SoftLaunch | Infra | Restart | Recreate web/stays | Restart policy recovers | docker compose |
| INF-006 | SoftLaunch | Infra | Migrations | schema_migrations | Soft-launch required set present | `verify-migrations.sh` |
| INF-007 | SoftLaunch | DR | Backup | Run backup once | Artifact + checksum | `PRODUCTION_BACKUP_AND_RESTORE.md` |
| INF-008 | SoftLaunch | DR | Restore | Restore to isolated PG | Data readable | same doc — **must actually restore** |

---

## 13. Observability

| ID | Tag | Area | Precondition | Steps | Expected | Evidence / automation |
|----|-----|------|--------------|-------|----------|------------------------|
| OBS-001 | SoftLaunch | Observability | Mock pay | Trace booking_id → intent → ledger | Runnable runbook | [PAID_NO_BOOKING_TRACE.md](../../ops/PAID_NO_BOOKING_TRACE.md) |
| OBS-002 | SoftLaunch | Observability | KYC webhook | Trace applicant → kyc_profiles → host gate | Runnable runbook | same + compliance logs |
| OBS-003 | SoftLaunch | Observability | Version | `/version` shows env | nexa_env=dogfood | smoke #3 |
| OBS-004 | SoftLaunch | Observability | Financial | Confirm logs invariant | guest=host+fee | financial-observability |

---

## 14. SEO

| ID | Tag | Area | Precondition | Steps | Expected | Evidence / automation |
|----|-----|------|--------------|-------|----------|------------------------|
| SEO-001 | SoftLaunch | SEO | Web | `/robots.txt` | Allows public; disallows private | `app/robots.ts` |
| SEO-002 | SoftLaunch | SEO | Web | `/sitemap.xml` | 200; includes locales/stays | `app/sitemap.ts` |
| SEO-003 | SoftLaunch | SEO | Listing page | canonical / metadata | Present | listing SEO |
| SEO-004 | SoftLaunch | SEO | City landing | SSG/ISR page | 200 | stays/[segment] |
| SEO-005 | SoftLaunch | SEO | Private routes | Profile/inbox | noindex or disallowed | robots |
| SEO-006 | SoftLaunch | SEO | Accidental noindex on public | Spot-check home/listing | Indexable | manual |

---

## 15. Mobile regression

| ID | Tag | Area | Precondition | Steps | Expected | Evidence / automation |
|----|-----|------|--------------|-------|----------|------------------------|
| MOB-001 | SoftLaunch | Mobile | iPhone Safari | Home + explore | Layout OK; safe-area | manual / chrome tests |
| MOB-002 | SoftLaunch | Mobile | Android Chrome | Same | OK | manual |
| MOB-003 | SoftLaunch | Mobile | Bottom nav | Scroll lists | No content through chrome | `MobileBottomNav` scrim; journey audit |
| MOB-004 | SoftLaunch | Mobile | DEMO OTP login | Keyboard | Fields usable | manual |
| MOB-005 | SoftLaunch | Mobile | Mock checkout | Sticky CTA vs nav | No overlay clash | booking page chrome |

---

## 16. Performance

| ID | Tag | Area | Precondition | Steps | Expected | Evidence / automation |
|----|-----|------|--------------|-------|----------|------------------------|
| PERF-001 | SoftLaunch | Perf | Home | Lighthouse mobile | Record LCP/CLS | measure:homepage script |
| PERF-002 | SoftLaunch | Perf | Explore API | Latency p95 | Record baseline | /stays/explore |
| PERF-003 | SoftLaunch | Perf | Listing detail | Images | Lazy/optimized | next/image |
| PERF-004 | SoftLaunch | Perf | Seeded catalog | Hundreds of listings | Explore usable | seed-morocco script (ops) |

---

## 17. Failure injection

| ID | Tag | Area | Precondition | Steps | Expected | Evidence / automation |
|----|-----|------|--------------|-------|----------|------------------------|
| FAIL-001 | SoftLaunch | Failure | Stop Redis briefly | Core book/pay mock | Degrades safely or recovers | manual dogfood |
| FAIL-002 | SoftLaunch | Failure | Restart stays mid-intent | Confirm after | Idempotent confirm | PAY-004 |
| FAIL-003 | SoftLaunch | Failure | Duplicate mock confirm | Twice | One ledger set | PAY-004 |
| FAIL-004 | SoftLaunch | Failure | Notifications down | Confirm booking | Booking still CONFIRMED | stays independent of push |
| FAIL-005 | SoftLaunch | Failure | Identity blip | Stays call | Error not corrupt booking | manual |
| FAIL-006 | PublicCutover | Failure | CMI late/dup webhook | — | Deferred | — |

---

## 18. Launch operations

| ID | Tag | Area | Precondition | Steps | Expected | Evidence / automation |
|----|-----|------|--------------|-------|----------|------------------------|
| OPS-001 | SoftLaunch | Ops | Written | Who approves hosts/listings | Named role + steps | [SOFT_LAUNCH_OPS.md](../../ops/SOFT_LAUNCH_OPS.md) |
| OPS-002 | SoftLaunch | Ops | Written | Refund/dispute under mock | Procedure | SOFT_LAUNCH_OPS + payout SOP |
| OPS-003 | SoftLaunch | Ops | Written | Safety emergency | Procedure | SOFT_LAUNCH_OPS |
| OPS-004 | SoftLaunch | Ops | Written | Paid-but-no-booking | Use OBS runbook | PAID_NO_BOOKING_TRACE |

---

## Mapping from older checklists

| Legacy source | Covered by |
|---------------|------------|
| `deploy/scripts/smoke-dogfood-checklist.md` #1–20 | INF-001/004, OTP-002/003, BOOK-001–004, PAY-002/003/006, SEC-004/005, HOST media |
| `deploy/scripts/smoke.sh` | INF-004, SEC-005, OBS-003 |
| `PRODUCTION_READINESS_CHECKLIST.md` P0s | Many fixed in code; SoftLaunch re-verify via PAY/BOOK/SEC IDs |
| `booking-pg-concurrency.prod-inv-001.spec.ts` | BOOK-005/006 |
| `booking-state-concurrency.spec.ts` | BOOK-007/008 |
| `mock-payment-confirm.spec.ts` | PAY-002–004 |
| `auth.otp-contract.spec.ts` | OTP-001 |
| `cors-origins.spec.ts` | SEC-005 |
| Frontend journey chrome audit | MOB-003 |
| `PRODUCTION_BACKUP_AND_RESTORE.md` | INF-007/008 |

---

## Count

| Tag | Count |
|-----|------:|
| SoftLaunch | 94 |
| PublicCutover | 6 |
| **Total** | **100** |
