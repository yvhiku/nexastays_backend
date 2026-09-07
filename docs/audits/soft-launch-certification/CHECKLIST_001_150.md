# Checklist 001–150 (canonical audit matrix)

**Date created:** 2026-09-07  
**Frozen:** `STAYS_PAYMENT_PROVIDER=mock` · DEMO OTP (dogfood) · `SUMSUB_MODE=sandbox`  
**Result values (fill in report):** PASS | FAIL | UNVERIFIED | N/A  
**Historical:** 2026-09-06 CONDITIONAL GO scorecard is **not** current certification.

| ID | Legacy | Area | Tag | Requirement | Env | Severity |
|----|--------|------|-----|-------------|-----|----------|
| 001 | PAY-001 | Payments | SoftLaunch | Confirm `STAYS_PAYMENT_PROVIDER=mock` in stays env → mock only | local | blocker |
| 002 | PAY-002 | Payments | SoftLaunch | Create booking → payment intent → Intent PENDING; provider mock | local | blocker |
| 003 | PAY-003 | Payments | SoftLaunch | Mock confirm (JWT) → Booking CONFIRMED; ledger GUEST_PAYMENT | local | blocker |
| 004 | PAY-004 | Payments | SoftLaunch | Confirm again → Idempotent success; no double ledger | local | blocker |
| 005 | PAY-005 | Payments | SoftLaunch | Abandon without confirm; wait expiry cron → Hold expires; dates free | local | blocker |
| 006 | PAY-006 | Payments | SoftLaunch | Cancel + mock refund path → REFUND ledger / status consistent | local | blocker |
| 007 | PAY-007 | Payments | SoftLaunch | View payment/booking in admin → Transaction visible | local | blocker |
| 008 | PAY-008 | Payments | SoftLaunch | `STAYS_HOST_PAYOUT_ENABLED` unset/false → Payout settlement off | local | blocker |
| 009 | PAY-009 | Payments | SoftLaunch | Ledger identity: guest = host_payout + fee → Financial invariant holds | local | blocker |
| 010 | PAY-010 | Payments | PublicCutover | Live PreAuth redirect → Out of scope soft-launch | public-cutover | blocker |
| 011 | PAY-011 | Payments | PublicCutover | HMAC callback verify → Out of scope soft-launch | public-cutover | blocker |
| 012 | PAY-012 | Payments | PublicCutover | Duplicate/late webhook → Out of scope soft-launch | public-cutover | blocker |
| 013 | KYC-001 | KYC | SoftLaunch | Confirm `SUMSUB_MODE=sandbox` → sandbox | local | blocker |
| 014 | KYC-002 | KYC | SoftLaunch | Webhook secret present → Boot requires secret | local | major |
| 015 | KYC-003 | KYC | SoftLaunch | Complete sandbox flow → Status syncs to Identity | local | major |
| 016 | KYC-004 | KYC | SoftLaunch | Invalid digest → 400 | local | major |
| 017 | KYC-005 | KYC | SoftLaunch | Deliver reviewed event → KYC profile updated | local | major |
| 018 | KYC-006 | KYC | SoftLaunch | Open KYC drawer + re-sync → Dossier fields + media | local | major |
| 019 | KYC-007 | KYC | SoftLaunch | Verified KYC or uploads → Host apply allowed | local | major |
| 020 | KYC-008 | KYC | SoftLaunch | Guest KYC policy → Booking gated per policy | local | major |
| 021 | KYC-009 | KYC | SoftLaunch | Reject + retry → Host can resubmit path | local | major |
| 022 | KYC-010 | KYC | PublicCutover | `SUMSUB_MODE=live` → Deferred | public-cutover | blocker |
| 023 | OTP-001 | OTP | SoftLaunch | Confirm DEMO OTP allowed → Code verifies without SMS | local | blocker |
| 024 | OTP-002 | OTP | SoftLaunch | Send OTP → Session created; DEMO path | local | major |
| 025 | OTP-003 | OTP | SoftLaunch | Verify → session → Access + refresh cookie | local | major |
| 026 | OTP-004 | OTP | SoftLaunch | Attempt lockout → Locked ~15 min | local | major |
| 027 | OTP-005 | OTP | SoftLaunch | Rate limit send → 429 / reject | local | major |
| 028 | OTP-006 | OTP | SoftLaunch | Verify late → Fail | local | major |
| 029 | OTP-007 | OTP | SoftLaunch | Grep OTP in app logs → Code never logged cleartext | local | major |
| 030 | OTP-008 | OTP | PublicCutover | EnvoiSMS/Twilio live → Deferred | public-cutover | blocker |
| 031 | BOOK-001 | Booking | SoftLaunch | Search → listing → Listing loads | local | major |
| 032 | BOOK-002 | Booking | SoftLaunch | Select dates/guests → Available | local | major |
| 033 | BOOK-003 | Booking | SoftLaunch | Create reservation → INITIATED/PAYMENT_PENDING | local | major |
| 034 | BOOK-004 | Booking | SoftLaunch | Confirm → CONFIRMED | local | major |
| 035 | BOOK-005 | Booking | SoftLaunch | Concurrent same dates → One wins; other 409 / EXCLUDE | isolated-pg | blocker |
| 036 | BOOK-006 | Booking | SoftLaunch | Inspect constraint → `ex_stays_bookings_active_overlap` | isolated-pg | blocker |
| 037 | BOOK-007 | Booking | SoftLaunch | Concurrent creates → Serialized via FOR UPDATE | local | major |
| 038 | BOOK-008 | Booking | SoftLaunch | Dates taken after hold → Expire hold; alert path | local | major |
| 039 | BOOK-009 | Booking | SoftLaunch | Replay → Idempotent | local | major |
| 040 | BOOK-010 | Booking | SoftLaunch | Resume / expire → No orphan CONFIRMED | local | major |
| 041 | BOOK-011 | Booking | SoftLaunch | Cancel confirmed → Status + notifications event | local | major |
| 042 | BOOK-012 | Booking | SoftLaunch | Cancel + refund mock → Consistent ledger | local | major |
| 043 | BOOK-013 | Booking | SoftLaunch | Checkin/checkout edges → daterange `[)` correct | local | major |
| 044 | BOOK-014 | Booking | SoftLaunch | BOOKED_STATUSES vs EXCLUDE WHERE → Match | local | blocker |
| 045 | HOST-001 | Host | SoftLaunch | DEMO OTP register → Account created | local | major |
| 046 | HOST-002 | Host | SoftLaunch | Complete/verify → Identity verified | local | major |
| 047 | HOST-003 | Host | SoftLaunch | Submit application → PENDING→APPROVED (admin) | local | major |
| 048 | HOST-004 | Host | SoftLaunch | Create listing draft → Draft saved | local | major |
| 049 | HOST-005 | Host | SoftLaunch | Submit for review → SUBMITTED | local | major |
| 050 | HOST-006 | Host | SoftLaunch | Receive mock booking → Host sees booking | local | major |
| 051 | MOD-001 | Moderation | SoftLaunch | Admin approve → APPROVED | local | major |
| 052 | MOD-002 | Moderation | SoftLaunch | Admin set-live → LIVE | local | major |
| 053 | MOD-003 | Moderation | SoftLaunch | Admin reject + reason → REJECTED | local | major |
| 054 | MOD-004 | Moderation | SoftLaunch | Host resubmit → SUBMITTED again | local | major |
| 055 | MOD-005 | Moderation | SoftLaunch | Attempt set status LIVE → Forbidden / impossible | local | blocker |
| 056 | MOD-006 | Moderation | SoftLaunch | Admin pause/unpublish → PAUSED / not public | local | major |
| 057 | TS-001 | T&S | SoftLaunch | File conversation report → Ticket/report created | local | major |
| 058 | TS-002 | T&S | SoftLaunch | Safety report → Safety + ticket | local | major |
| 059 | TS-003 | T&S | SoftLaunch | List/open ticket → Detail + messages | local | major |
| 060 | TS-004 | T&S | SoftLaunch | Reply to customer → Message delivered | local | major |
| 061 | TS-005 | T&S | SoftLaunch | Customer message → Locked / reopen rules | local | major |
| 062 | TS-006 | T&S | SoftLaunch | Escalate ticket → ESCALATED | local | major |
| 063 | TS-007 | T&S | SoftLaunch | Report listing → Visible to admin | local | major |
| 064 | TS-008 | T&S | SoftLaunch | Admin suspend → Access blocked | local | major |
| 065 | TS-009 | T&S | SoftLaunch | listing_frozen → Host cannot list | local | major |
| 066 | TS-010 | T&S | SoftLaunch | Admin action → Audit log row | local | major |
| 067 | NOTIF-001 | Notif | SoftLaunch | Event published → BOOKING_CONFIRMED mapped | local | major |
| 068 | NOTIF-002 | Notif | SoftLaunch | Event → PAYMENT_SUCCEEDED | local | major |
| 069 | NOTIF-003 | Notif | SoftLaunch | Event → BOOKING_CANCELLED guest+host | local | major |
| 070 | NOTIF-004 | Notif | SoftLaunch | Event → MESSAGE_RECEIVED | local | major |
| 071 | NOTIF-005 | Notif | SoftLaunch | Dispatch → Skip FCM safely | local | major |
| 072 | NOTIF-006 | Notif | SoftLaunch | Dispatch → Stub/log only → N/A delivery | local | info |
| 073 | NOTIF-007 | Notif | SoftLaunch | Dispatch → Stub/log only → N/A delivery | local | info |
| 074 | NOTIF-008 | Notif | SoftLaunch | Check mapper → Not mapped → N/A product gap recorded | local | info |
| 075 | PAYOUT-001 | Payout | SoftLaunch | Ledger HOST_PAYOUT PENDING → Row exists | local | major |
| 076 | PAYOUT-002 | Payout | SoftLaunch | Read pending → Σ PENDING HOST_PAYOUT | local | major |
| 077 | PAYOUT-003 | Payout | SoftLaunch | `STAYS_HOST_PAYOUT_ENABLED=false` → available≈0; disclaimer | local | major |
| 078 | PAYOUT-004 | Payout | SoftLaunch | Follow manual SOP → Documented process | local | major |
| 079 | PAYOUT-005 | Payout | SoftLaunch | Ledger impact → HOST_PAYOUT adjusted/consistent | local | major |
| 080 | PAYOUT-006 | Payout | PublicCutover | Enable flag + certify → Deferred | public-cutover | blocker |
| 081 | LEG-001 | Legal | SoftLaunch | `/terms` → 200 + content | browser-emulation | major |
| 082 | LEG-002 | Legal | SoftLaunch | `/privacy` → 200 | browser-emulation | major |
| 083 | LEG-003 | Legal | SoftLaunch | `/refund` → 200 | browser-emulation | major |
| 084 | LEG-004 | Legal | SoftLaunch | `/fees` or commission disclosure → Visible | browser-emulation | major |
| 085 | LEG-005 | Legal | SoftLaunch | Moroccan legal review → Soft-launch: N/A or BLOCKED pending counsel | local | info |
| 086 | SEC-001 | Security | SoftLaunch | Unauth call → 401 | local | blocker |
| 087 | SEC-002 | Security | SoftLaunch | Access host B booking → 403/404 | local | blocker |
| 088 | SEC-003 | Security | SoftLaunch | Non-admin admin route → 403 | local | major |
| 089 | SEC-004 | Security | SoftLaunch | Cookie HttpOnly → Not readable by JS | local | major |
| 090 | SEC-005 | Security | SoftLaunch | Bad origin → Reject | local | major |
| 091 | SEC-006 | Security | SoftLaunch | Response headers → CSP present | deployed-infra | major |
| 092 | SEC-007 | Security | SoftLaunch | Oversize / bad type → Reject | local | major |
| 093 | SEC-008 | Security | SoftLaunch | Traversal userId → Contained under uploads/profile | local | major |
| 094 | SEC-009 | Security | SoftLaunch | Repo grep → No live secrets committed | local | major |
| 095 | SEC-010 | Security | SoftLaunch | Force 500 → No stack/secrets to client | local | major |
| 096 | INF-001 | Infra | SoftLaunch | HTTPS → TLS everywhere | deployed-infra | blocker |
| 097 | INF-002 | Infra | SoftLaunch | Port scan from public → Not exposed | deployed-infra | blocker |
| 098 | INF-003 | Infra | SoftLaunch | Public → Not exposed | deployed-infra | blocker |
| 099 | INF-004 | Infra | SoftLaunch | identity+stays ready → 200 | deployed-infra | blocker |
| 100 | INF-005 | Infra | SoftLaunch | Recreate web/stays → Restart policy recovers | deployed-infra | major |
| 101 | INF-006 | Infra | SoftLaunch | schema_migrations → Soft-launch required set present | isolated-pg | blocker |
| 102 | INF-007 | DR | SoftLaunch | Run backup once → Artifact + checksum | isolated-pg | blocker |
| 103 | INF-008 | DR | SoftLaunch | Restore to isolated PG → Data readable | isolated-pg | blocker |
| 104 | OBS-001 | Observability | SoftLaunch | Trace booking_id → intent → ledger → Runnable runbook | local | major |
| 105 | OBS-002 | Observability | SoftLaunch | Trace applicant → kyc_profiles → host gate → Runnable runbook | local | major |
| 106 | OBS-003 | Observability | SoftLaunch | `/version` shows env → nexa_env=dogfood | deployed-infra | minor |
| 107 | OBS-004 | Observability | SoftLaunch | Confirm logs invariant → guest=host+fee | local | major |
| 108 | SEO-001 | SEO | SoftLaunch | `/robots.txt` → Allows public; disallows private | browser-emulation | major |
| 109 | SEO-002 | SEO | SoftLaunch | `/sitemap.xml` → 200; includes locales/stays | browser-emulation | major |
| 110 | SEO-003 | SEO | SoftLaunch | canonical / metadata → Present | browser-emulation | major |
| 111 | SEO-004 | SEO | SoftLaunch | SSG/ISR page → 200 | browser-emulation | major |
| 112 | SEO-005 | SEO | SoftLaunch | Profile/inbox → noindex or disallowed | browser-emulation | major |
| 113 | SEO-006 | SEO | SoftLaunch | Spot-check home/listing → Indexable | browser-emulation | major |
| 114 | MOB-001 | Mobile | SoftLaunch | Home + explore → Layout OK; safe-area | device | major |
| 115 | MOB-002 | Mobile | SoftLaunch | Same → OK | device | major |
| 116 | MOB-003 | Mobile | SoftLaunch | Scroll lists → No content through chrome | local | major |
| 117 | MOB-004 | Mobile | SoftLaunch | Keyboard → Fields usable | device | minor |
| 118 | MOB-005 | Mobile | SoftLaunch | Sticky CTA vs nav → No overlay clash | local | major |
| 119 | PERF-001 | Perf | SoftLaunch | Lighthouse mobile → Record LCP/CLS | local | major |
| 120 | PERF-002 | Perf | SoftLaunch | Latency p95 → Record baseline | local | major |
| 121 | PERF-003 | Perf | SoftLaunch | Images → Lazy/optimized | local | major |
| 122 | PERF-004 | Perf | SoftLaunch | Hundreds of listings → Explore usable | local | major |
| 123 | FAIL-001 | Failure | SoftLaunch | Core book/pay mock → Degrades safely or recovers | local | major |
| 124 | FAIL-002 | Failure | SoftLaunch | Confirm after → Idempotent confirm | local | major |
| 125 | FAIL-003 | Failure | SoftLaunch | Twice → One ledger set | local | major |
| 126 | FAIL-004 | Failure | SoftLaunch | Confirm booking → Booking still CONFIRMED | local | major |
| 127 | FAIL-005 | Failure | SoftLaunch | Stays call → Error not corrupt booking | local | major |
| 128 | FAIL-006 | Failure | PublicCutover | — → Deferred | public-cutover | blocker |
| 129 | OPS-001 | Ops | SoftLaunch | Who approves hosts/listings → Named role + steps | local | major |
| 130 | OPS-002 | Ops | SoftLaunch | Refund/dispute under mock → Procedure | local | major |
| 131 | OPS-003 | Ops | SoftLaunch | Safety emergency → Procedure | local | major |
| 132 | OPS-004 | Ops | SoftLaunch | Paid-but-no-booking → Use OBS runbook | local | major |
| 133 | — | Foundation | SoftLaunch | Identity `tsc --noEmit` passes | local | blocker |
| 134 | — | Foundation | SoftLaunch | Stays `tsc --noEmit` passes | local | blocker |
| 135 | — | Foundation | SoftLaunch | Web `check:locales` passes | local | blocker |
| 136 | — | Foundation | SoftLaunch | Web audit/unit tsx suite passes | local | major |
| 137 | — | Foundation | SoftLaunch | Dashboard `tsc --noEmit` passes | local | major |
| 138 | — | Foundation | SoftLaunch | Identity eslint without `--fix` (findings recorded) | local | major |
| 139 | — | Foundation | SoftLaunch | Stays eslint without `--fix` (findings recorded) | local | major |
| 140 | — | Foundation | SoftLaunch | Identity+Stays+Web+Dashboard `npm audit --audit-level=high` | local | major |
| 141 | — | IsolatedPG | SoftLaunch | Disposable PG16 applies Identity+Stays migrations | isolated-pg | blocker |
| 142 | — | IsolatedPG | SoftLaunch | Execute `booking-pg-concurrency` with STAYS_PG_CONCURRENCY=1 | isolated-pg | blocker |
| 143 | — | IsolatedPG | SoftLaunch | pg_dump/restore disposable drill (non-app DB) | isolated-pg | blocker |
| 144 | — | Auth | SoftLaunch | Logout refresh revoke executed test | local | blocker |
| 145 | — | Security | SoftLaunch | Synthetic invalid Sumsub webhook HMAC rejected | local | blocker |
| 146 | — | Product | SoftLaunch | Support CLOSED ticket rules executed (support-tickets tests) | local | major |
| 147 | — | Web | SoftLaunch | RTL `ar` locale dir=rtl smoke | browser-emulation | major |
| 148 | — | Infra | SoftLaunch | Host compose binds Postgres/Redis to 127.0.0.1 | local | blocker |
| 149 | — | PublicCutover | PublicCutover | Production forbids DEMO_OTP; requires cmi+live Sumsub+SMS | public-cutover | blocker |
| 150 | — | Ops | SoftLaunch | Audit report records frozen mock/DEMO/sandbox statement | local | blocker |

## Count

| Band | Count |
|------|------:|
| 001–132 (legacy PASSFAIL map) | 132 |
| 133–150 (audit expansion) | 18 |
| **Total** | **150** |
