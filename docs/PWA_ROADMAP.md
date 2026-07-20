# Nexa Stays PWA roadmap

Installable Progressive Web App and mobile shell for [`nexastays_web`](../nexastays_web).

## Status

| Phase | Focus | Status |
| --- | --- | --- |
| 1 | PWA core + installable polish (Sprint 1 B+) | **Done — launch-complete** |
| 2 | Mobile shell (4-tab bottom nav, safe areas) | **Done** (superseded by floating glass below) |
| Sprint 1 nav + Save | Floating glass nav, Search FAB sheet, Saved rename, premium Save UX | **Done** |
| Sprint 2 | Rich search sheet + **Saved Collections** + interaction quality | Deferred |
| 3 | Search redesign + install funnel analytics | Deferred (partially in Sprint 2) |
| 4 | Explore map | Deferred |
| 5 | Bottom sheets | Deferred (Sprint 2) |
| 6 | Offline enhancements (saved trips) | Deferred |
| 7 | Push notifications | Deferred |
| 8 | Share + shortcuts | Done |
| 9 | Performance budget enforcement | Documented; CI later |
| 10 | WebAuthn | Deferred |

## Sprint 1 B+ — shipped

- Value-only install triggers (no 45s timer): 2nd listing, wishlist, booking, return visit; host listing submit, host approved, dashboard 3+
- Contextual install copy; Android Install App / iOS Show me how + illustration
- `dismissed_until` 30 days; install = never again
- One-time standalone welcome screen
- Premium update banner (Update Now / Dismiss)
- Offline: No internet + recently viewed + Retry + Browse recently viewed
- Adaptive splash 500–1200ms (standalone, once per open)
- Icons: 16/32 favicon, 180 apple, 192/512, maskable, monochrome
- Three intentional screenshots (explore / listing / host)
- Manifest: description, categories, portrait, `start_url: "/"`

## Sprint 1 — premium mobile nav + Save (shipped)

**Guest nav:** Explore · Saved · Search (center FAB) · Trips · Profile — floating glass chrome (`rounded-[28px]`, blur, soft shadow).

**Host nav:** Dashboard · Bookings · Listings · Profile — same chrome, no Search FAB.

**Search FAB:** Opens a minimal sheet wrapping existing `SearchBar` → `/listings?...`. Recents / popular / recently viewed = Sprint 2.

**Saved (renamed from Wishlist):** Bookmark metaphor; copy in en/fr/ar; manifest shortcut **Saved**; URL remains `/saved-listings`.

**Premium Save UX:**

- Bookmark fill/pop animation on save
- First save ever: onboarding bottom sheet (listing preview + Browse Saved / Continue exploring)
- Every save: toast “Saved · View Saved →” (~2s)
- Once at 3+ saves: “You’re building your collection · See Saved →”
- Unsave: “Removed · Undo” (~4s)
- Empty Saved page: bookmark + travel copy + Explore CTA

**Collections** (named lists) = Sprint 2 — Saved is designed to grow later.

## Sprint 2 — post-launch UX

- Rich mobile search sheet (recents / popular / recently viewed)
- **Saved Collections** (named lists)
- Skeleton loading
- Page transitions
- Bottom sheets (filters / guests / dates)
- Pull-to-refresh
- Lighthouse 95+ (Performance / A11y / SEO / Best Practices)

## Future

- Restore last-visited page on open (not search-first)
- Install funnel analytics: `install_prompt_shown`, `install_clicked`, `install_accepted`, `install_dismissed`, `app_installed`

## Performance budget (enforce later)

| Metric | Budget |
| --- | --- |
| JS initial (gzipped, critical route) | < 250 KB |
| LCP | < 2.5 s |
| CLS | < 0.1 |
| INP | < 200 ms |
| Images | WebP/AVIF + lazy load |
