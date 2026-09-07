# 118 — SQLi-shaped params — PASS

Evidence: `118-sqli.txt`

| Payload | HTTP | Notes |
|---|---|---|
| `Casablanca' OR '1'='1` | **400** | `city contains invalid characters` |
| `1; DROP TABLE bookings--` | **400** | same |
| `' UNION SELECT NULL--` | **200** | empty `items:[]` — no SQL error / data leak |

Leak heuristics (syntax error / pg_ / sqlstate / stack / SELECT): **0**.
