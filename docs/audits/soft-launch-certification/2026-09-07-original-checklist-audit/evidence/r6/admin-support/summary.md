# R6 Admin / support (101–108)

**Date:** 2026-09-07  
**Admin login:** `POST https://identity.nexastays.ma/api/v1/auth/admin/login`  
**Mechanism:** Allowlisted `ADMIN_EMAILS` + `ADMIN_PASSWORD_HASH` present on VPS (values not printed). Probes used ephemeral provisioned staff (`account_type=ADMIN`, `staff_password_hash`) then disabled.

## ID verdicts

| ID | Verdict | What was probed | Evidence |
|---|---|---|---|
| 101 | **PASS** | `GET /admin/users?search=` finds users (by id/phone) | `101-108-probes.json` |
| 102 | **PASS** | `GET /admin/users/:id` + `GET /admin/users/:id/kyc` | same |
| 103 | **PASS** | `GET /admin/stays/bookings` (total≥1) | same |
| 104 | **PASS** | `GET /admin/stays/bookings/:id` returns booking detail | same |
| 105 | **PASS** | `GET /admin/stays/listings` + get-by-id during moderation | same + host-allow journey |
| 106 | **PASS** | Approve+set-live on LIVE path; reject on SUBMITTED → REJECTED | `106-reject.json` + journey |
| 107 | **UNVERIFIED** | Guest report is conversation-scoped (`POST /messaging/conversations/:id/report`). No conversation available for synthetic guest. Admin `GET /admin/stays/reports` works (empty/list). | `101-108-probes.json` |
| 108 | **PASS** | `POST /support/tickets` → 201 with `ticket_number`; admin list tickets 200 | same |

## Availability note

- VPS has `ADMIN_EMAILS` (1× `@nexastays.ma`) and `ADMIN_PASSWORD_HASH` set on identity container.
- Plaintext `ADMIN_PASSWORD` unset (hash-only) — correct for dogfood.
- No secrets written to evidence.
