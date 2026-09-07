# 115 — Sensitive info not in API errors — PASS

Evidence: `115-error-bodies.txt`

| Case | HTTP | Body notes |
|---|---|---|
| Bad phone login | 400 | `Phone number has too few digits` — no stack/SQL |
| Host listings no auth | 401 | `No authorization token provided` |
| Unknown stays route | 404 | Nest not-found message only |
| Invalid listing UUID | 400 | `Validation failed (uuid is expected)` |

No password hashes, connection strings, stack traces, or SQLSTATE in bodies.
