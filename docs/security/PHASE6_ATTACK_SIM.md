# Phase 6 — Production readiness attack simulation

**Goal:** Think like a malicious host/guest trying to monetize exploits — not QA.  
**Duration:** 1 full day against staging or local prod-like stack.  
**Exit:** Scorecard has no open Critical/High (or Accepted with owner + expiry).

## Setup

- [ ] Phase 0 inventory URLs filled  
- [ ] Accounts: Host A, Host B, Guest A, Guest B, Admin  
- [ ] Two LIVE listings (A and B) with bookings  
- [ ] CMI sandbox or mock **only if** documenting mock-gate separately  
- [ ] Request-id logging enabled  

## Attack agenda

| # | Attack | Pass criteria | Result | Finding ID |
| --- | --- | --- | --- | --- |
| 1 | Steal Host B listing via Host A JWT | 403/404 | | |
| 2 | Steal Host B bookings / CSV export | 403/404 | | |
| 3 | Steal / regenerate B calendar ICS; use old token | old token fails | | |
| 4 | Guest A pays Host B’s booking intent | fail | | |
| 5 | Bypass payment / replay CMI webhook | no free confirm | | |
| 6 | Overbook same dates (parallel) | one wins | | |
| 7 | Zero / negative price listing go LIVE | rejected | | |
| 8 | Mass-assign `status:LIVE` / `host_user_id` | ignored | | |
| 9 | Escalate `role=admin` in profile body | ignored | | |
| 10 | SSRF ICS to metadata / RFC1918 | rejected | | |
| 11 | Upload polyglot / oversized media | rejected | | |
| 12 | Abuse reviews (other booking) | fail | | |
| 13 | Scrape emails / PII via search or exports | no leak | | |
| 14 | Enumerate UUIDs / sequential IDs | no oracle | | |
| 15 | DoS search / burn rate limits | 429 | | |
| 16 | Steal payouts / change commission | impossible | | |

## Scorecard

| ID | Severity | Endpoint | Repro | Owner | Due | Retest | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P6-001 | | | | | | | |

## Sign-off

| Role | Name | Date | Notes |
| --- | --- | --- | --- |
| Executor | | | |
| Eng owner | | | |
| Launch decision | | | Go / No-go |

**Status:** Checklist ready — execute on staging before public payment traffic.
