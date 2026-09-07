# Browser observations, 2026-09-07

Executed with Codex in-app browser viewport emulation against an isolated dev snapshot of the web repository. This is not iOS Safari, Android Chrome, or a native Flutter run.

- Arabic at 390px: document lang=ar, dir=rtl, scrollWidth=390. French language selection reached a fr/ltr page.
- Before repair, French header menu right edge=403px at viewport width=390px: clipped.
- After NavBar repair, menu bounds left=338px, right=382px, width=44px at 390px. Visual inspection at 320px showed all header controls visible.
- Wordmark hidden below 400px; logo link retains accessible name Nexa Stays.
- Initial browser API requests were blocked by audit CORS; only isolated process allowlist was adjusted. Existing application configuration was not changed.
- No complete browser booking, admin, upload, onboarding, keyboard, notch, or real device journey was executed. Production HTTP browser redirect was not bypassed; server-rendered HTTP probes used a simulated trusted TLS-terminating proxy header.
- On final inspection the audit browser had no remaining tabs. Screenshots were inspected inline but not archived as durable artifacts.
