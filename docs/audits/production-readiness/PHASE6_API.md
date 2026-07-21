# Phase 6 — API, DTO, Error Taxonomy, OpenAPI

**Score: 8.0/10**

## Response envelope inconsistency

| Service | Default shape | Opt-in envelope |
|---------|---------------|-----------------|
| Stays | Raw DTO or `{ data }` mixed | `x-api-envelope: 1` |
| Identity | Raw | `x-api-envelope: 1` via transform interceptor |
| Notifications list | `{ data: items }` always | `users.controller.ts:537-567` |

Web clients use defensive `unwrap()` — works but masks drift.

## Error taxonomy gaps

| Anti-pattern | Example | Should be |
|--------------|---------|-----------|
| 404 vs 403 | Non-participant messaging → 404 | OK (anti-enumeration) |
| BadRequest for auth | Some legacy routes | 401/403 |
| Generic 500 | Non-HttpException unhandled | Filter only catches HttpException |

**Filter:** `HttpExceptionFilter` only — unhandled errors may leak stack in dev.

## DTO audit summary

| Check | Status |
|-------|--------|
| class-validator on launch DTOs | Mostly yes |
| @Type() on nested objects | Spot-check needed on complex booking DTOs |
| Update DTOs expose immutable fields | mass-assignment.spec.ts covers stays — **good** |
| Duplicated create/update DTOs | Some drift between host listing wizard and API |

## OpenAPI / Swagger

- Stays: partial `@Api*` decorators
- Identity: partial
- **Gap:** Not every launch endpoint has `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth`

**Recommendation:** Generate OpenAPI in CI and diff on PR (P2).

## Error consistency target

```json
{ "success": false, "error": { "code", "message", "details" }, "traceId": "..." }
```

Today: mixed Nest default + optional envelope header.
