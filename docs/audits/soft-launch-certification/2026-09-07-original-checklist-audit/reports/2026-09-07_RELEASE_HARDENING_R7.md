# Nexa Stays — Release Hardening & Certification R7

**Report date:** 2026-09-07  
**Freeze unchanged:** mock payments, DEMO OTP, Sumsub sandbox, host payouts off.

## Executive verdict

| Decision | Conclusion |
|---|---|
| R7 conversion | **19 UNVERIFIED → PASS** (111–119, 085–086, 096–100, 145/147/148) |
| Still UNVERIFIED | 146 (host metrics), 149 (backup alert rehearsal) |
| Matrix contribution | Security + mock notifications + ops subset |

## Conversions

Security **111–119 PASS** on live `*.nexastays.ma`.  
Notifications **085–086, 096–100 PASS** after inbox `event_id::text` fix + mock confirm/cancel/message.  
Ops **145/147/148 PASS**; **146/149 UNVERIFIED**.

## Evidence

`evidence/r7/{security,notifications,ops}/`

## Commits

Notifications inbox cast fix (platform) + VPS dist hotpatch. No freeze flips.
