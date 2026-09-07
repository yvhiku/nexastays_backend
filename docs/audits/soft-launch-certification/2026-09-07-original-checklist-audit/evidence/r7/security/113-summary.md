# 113 — CORS allowlist — PASS

Evidence: `113-cors.txt`

| Probe | Result |
|---|---|
| OPTIONS `Origin: https://nexastays.ma` → identity `/auth/otp/send` | `access-control-allow-origin: https://nexastays.ma` |
| OPTIONS `Origin: https://evil.example` → same | **no** `access-control-allow-origin` |
| POST allowed Origin | ACAO reflects `https://nexastays.ma` |
| POST bad Origin | response processed server-side (expected) but **no ACAO** (browser would block) |
| Stays explore OPTIONS good/bad | same pattern |

Dogfood `CORS_ORIGINS=https://nexastays.ma,https://admin.nexastays.ma` (VPS deploy `.env`).
