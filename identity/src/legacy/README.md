# Legacy Identity code (do not import from active services)

Pay, Go, and duplicate Stays modules from the monolith extraction live here.

**Active Identity boot (`app.module.ts`) must NOT import from this folder.**

Enforced via ESLint `no-restricted-imports` on `backend/identity/src/**/*.ts` (excluding this tree).

When Pay/Go are extracted, code moves out of `legacy/` into their own repos/services.
