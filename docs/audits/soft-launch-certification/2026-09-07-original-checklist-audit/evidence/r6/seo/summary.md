# R6 SEO live crawl (129, 131–134)

**Date:** 2026-09-07  
**Origin:** `https://nexastays.ma` (+ Stays SEO API)

## ID verdicts

| ID | Verdict | Finding | Evidence |
|---|---|---|---|
| 129 | **PASS** | `robots.txt` 200: Allow `/`, disallow private paths, `Host` + `Sitemap`, Cloudflare Content-Signal block present | `129-134-crawl.txt`, `129-134-final.txt` |
| 131 | **PASS** | Homepage canonical `https://nexastays.ma/en`; listing canonical `https://nexastays.ma/en/listings/{id}` | `129-134-pages.txt`, `129-134-final.txt` |
| 132 | **PASS** | Listing title/description/OG title present and listing-specific | same + `064-listing-page-seo.txt` |
| 133 | **PASS** | Homepage OG OK; listing `og:image` now absolute `https://api.nexastays.ma/.../media/...` after config fix | `133-og-after-env-fix.txt`, `129-134-final.txt` |
| 134 | **PASS** | Homepage `robots=index, follow`. Listing `noindex,follow` is **intentional** quality gate (`seoScore` 59 &lt; threshold 70), not accidental | API SEO payload in `129-134-final.txt` |

## Config fix (no image rebuild)

- Stays SEO builder reads `STAYS_API_PUBLIC_URL` (fallback was `http://127.0.0.1:3002/api/v1`).
- VPS had only `STAYS_PUBLIC_URL` → OG images leaked localhost.
- Appended `STAYS_API_PUBLIC_URL=https://api.nexastays.ma/api/v1` to deploy `.env`, recreated stays, cleared Next fetch cache / restarted web.
- Freeze keys unchanged (`mock` / DEMO OTP / sandbox).
