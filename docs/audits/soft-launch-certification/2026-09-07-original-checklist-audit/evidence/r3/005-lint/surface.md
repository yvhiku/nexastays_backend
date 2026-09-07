# Certified lint surface (Gate 1 / original 005)

Aligned with tsconfig.build shippable Nest code:

- Includes: `src/**/*.ts` under Identity and Stays
- Excludes: `src/legacy/**` (Identity, unwired), `**/*spec.ts`, `test/**`, `scripts/**`, `src/scripts/**`, `dist/**`
- `npm run lint:check` — non-mutating, must exit 0 (zero errors)
- Warnings (unsafe-* Nest/TypeORM, require-await, etc.) remain tracked but non-blocking
- Flutter analyzer not in backend 005 gate

