# 114 — API rate limiting — PASS

Evidence: `114-rate-limit.txt`

Forced `POST /api/v1/auth/send-otp` with same phone:
- tries 1–5 → HTTP 200 `{"sent":true}`
- tries 6–8 → HTTP **429** `Too many OTP requests. Try again later.` (OTP send rate limit)

Also observed Nest throttler headers on auth (`x-ratelimit-limit-short: 3`) and health (`x-ratelimit-limit-short: 15`).
