# Nexa Stays PWA roadmap

Installable Progressive Web App and mobile shell for [`nexastays_web`](../nexastays_web).

## Status

| Phase | Focus | Status |
| --- | --- | --- |
| 1 | PWA core + installable polish (Sprint 1 B+) | **Done — launch-complete** |
| 2 | Mobile shell (4-tab bottom nav, safe areas) | **Done** |
| Sprint 2 | Interaction quality (skeletons, transitions, bottom sheets, PTR, Lighthouse 95+) | Deferred |
| 3 | Search redesign + install funnel analytics | Deferred |
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

## Sprint 2 — post-launch UX

- Skeleton loading
- Page transitions
- Bottom sheets (filters / guests / dates)
- Pull-to-refresh
- Search improvements
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
