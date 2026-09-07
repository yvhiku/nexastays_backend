# R8 dogfood performance budgets (written)

Scope: soft-launch / dogfood traffic on `*.nexastays.ma`, not production-scale load.

| ID | Metric | Dogfood budget | Pass rule |
|---|---|---|---|
| 136 | Homepage TTFB (`time_starttransfer`) on `https://nexastays.ma/en` | < 2000 ms | median of ≥3 curls |
| 136 | Homepage HTML total (`time_total`) on `/en` | < 3000 ms | median of ≥3 curls |
| 136 | HTTP status | 200 on `/en` | all `/en` samples (`/` may 307 locale redirect) |
| 137 | LIVE listing page TTFB | < 2000 ms | median of ≥3 curls |
| 137 | LIVE listing page HTML total | < 4000 ms | median of ≥3 curls |
| 137 | HTTP status | 200 | all samples |
| 140 | Explore/listing API p95 | < 800 ms | 20 sequential GETs, browser UA |
| 140 | HTTP status | 200 | ≥19/20 |
| 139 | Image: lazy and/or next/image and/or width/height/srcset; Cache-Control/CDN | present / documented | HTML + media headers |

Lighthouse: optional; CLI not available on audit host — curl TTFB budgets are authoritative for this wave.

138 / 142: out of scope (no prod-scale search harness / concurrent booking script).
