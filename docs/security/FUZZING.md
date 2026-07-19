# API fuzzing runbook (Nexa Stays)

Use against **local** or **staging** only. Do not fuzz production.

## Prerequisites

- Identity + Stays running
- OpenAPI/Swagger enabled (non-prod): typically `/api/docs-json` or `/api/docs-yaml`
- Test JWTs: Guest, Host A, Host B, Admin

## Schemathesis

```bash
export TOKEN_HOST_A='...'
schemathesis run "$STAYS_BASE/api/docs-json" \
  --header "Authorization: Bearer $TOKEN_HOST_A" \
  --checks all \
  --hypothesis-max-examples 50 \
  --report schemasthesis-stays
```

Repeat for Identity OpenAPI with consumer + admin tokens.

## Manual payload smoke (curl / Burp Intruder)

For `PATCH /stays/host/listings/:id` and `POST /stays/bookings`:

| Class | Example |
| --- | --- |
| Long string | 50k `A` in `title` |
| UTF-8 | emoji, Arabic, RTL marks |
| Negative IDs | `guest_count: -1` |
| Nulls | `"title": null` |
| Huge arrays | 10k amenities |
| Empty JSON | `{}` |
| Duplicate JSON keys | last-wins ambiguity |
| Bad enums | `"listing_type": "CASTLE"` |
| Mass assignment | `"host_user_id"`, `"status":"LIVE"`, `"commission":0` |
| Multipart | 20MB+ image, wrong magic bytes |

Expect **400/422/403/404** — not **500**.

## ffuf path discovery

```bash
ffuf -u "$STAYS_BASE/api/v1/FUZZ" -w wordlists/common-api.txt -mc 200,201,204,401,403 -o ffuf-stays.json
```

Triage unexpected 200s (forgotten admin/debug routes).

## RESTler / Burp

Optional deeper campaigns after Schemathesis smoke is clean.

## Tracking

Log crashes in the [PRE_LAUNCH_SECURITY.md](../PRE_LAUNCH_SECURITY.md) scorecard as **High** until fixed.
