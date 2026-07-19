# Nexa Stays PWA roadmap

Installable Progressive Web App and mobile shell for [`nexastays_web`](../nexastays_web).

## Status

| Phase | Focus | Status |
| --- | --- | --- |
| 1 | PWA core (manifest, SW, install, offline, update banner) | **Done** (this pass) |
| 2 | Mobile shell (4-tab bottom nav, safe areas, slim top bar) | **Done** (this pass) |
| 3 | Search redesign | Deferred |
| 4 | Explore map | Deferred |
| 5 | Bottom sheets | Deferred |
| 6 | Offline enhancements | Deferred |
| 7 | Push notifications | Deferred |
| 8 | Share + shortcuts (partial) | Shortcuts + share shipped; more later |
| 9 | Performance budget enforcement | Documented now; CI gates later |
| 10 | WebAuthn | Deferred |

## Phase 1 — shipped

- `app/manifest.ts`: `start_url: "/"`, Nexa surface theme, dedicated N icons + maskable, shortcuts, screenshots
- `@ducanh2912/next-pwa`: layered caches (shell / HTML NetworkFirst / fonts CacheFirst / images SWR / API GET NetworkFirst)
- Premium `public/offline.html` with recently viewed from `localStorage`
- Engagement-gated `InstallAppPrompt` (≥2 pages + 45s **or** wishlist **or** signed-in **or** host dashboard); iOS Add to Home tip
- `SwUpdateBanner` when a new service worker is waiting

## Phase 2 — shipped

- Guest tabs: Explore · Wishlist · Trips · Profile
- Host tabs: Dashboard · Bookings · Listings · Profile (Earnings stay inside Dashboard)
- Safe-area insets top + bottom; mobile top bar: logo · notifications stub · profile

## Also shipped this pass

- Recently viewed (localStorage, max 20) on home + offline browse
- Listing share via `navigator.share()` with copy-link fallback

## Out of scope (now)

Push, WebAuthn, QR, pull-to-refresh, search bottom sheets, Explore map overhaul, Lighthouse CI fail gates, Flutter, fifth host Earnings tab.

## Performance budget (enforce later)

Documented targets for Phase 9:

| Metric | Budget |
| --- | --- |
| JS initial (gzipped, critical route) | < 250 KB |
| LCP | < 2.5 s |
| CLS | < 0.1 |
| INP | < 200 ms |
| Images | WebP/AVIF + lazy load |

## Verify checklist

- Install from `/` lands correct locale via middleware
- Chrome: shortcuts + screenshots in install UI; Update banner on new build
- Offline: premium copy + recently viewed
- Guest 4 tabs / Host 4 tabs; earnings only on dashboard
- Safe-area top + bottom on notched iPhones
- Share → native sheet or copy fallback
