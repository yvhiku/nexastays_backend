# Nexa Stays — Pre-Launch Security

Formal security program before public booking/payment traffic. Complements [PRODUCTION_READINESS_RUNBOOK.md](./PRODUCTION_READINESS_RUNBOOK.md) and [DEPLOYMENT.md](./DEPLOYMENT.md).

**Tracks**

| Question | Evidence |
| --- | --- |
| Is the backend secure? | BOLA, mass assignment, JWT, payments, financial integrity |
| Can someone compromise infrastructure? | Ports, DB isolation, Docker, TLS, CDN cache, secrets |

GraphQL is N/A (REST-only).

---

## Phase 0 — Asset inventory

Every public surface must have an **owner**. Fill **Staging URL** when DNS exists (`STAGING_*` env otherwise).

| Asset | Local / default | Staging URL | Owner | Notes |
| --- | --- | --- | --- | --- |
| Identity API | `http://127.0.0.1:3001/api/v1` | | Platform / Identity | Auth, OTP, JWKS, admin, KYC |
| Stays API | `http://127.0.0.1:3002/api/v1` | | Stays | Search, bookings, host, payments, calendar, reviews |
| Guest web | `nexastays_web` `:3005` | | Web | Next.js guest + host UI |
| Admin dashboard | `nexastays_dashboard` `:3010` | | Admin | Admin ops |
| Waitlist | `join.nexastays.ma` | live | Growth | Marketing only |
| Swagger (Identity) | `/api/docs` non-prod | | Identity | **Off in production** |
| Swagger (Stays) | `/api/docs` non-prod | | Stays | **Off in production** |
| Health | `/api/v1/health` (or app health) | | Ops | No secrets |
| Metrics | gated metrics endpoint | | Ops | Auth / internal only |
| CMI webhook | `POST .../stays/webhooks/payments/cmi` | | Payments | Public + HMAC |
| Mock payment webhook | `POST .../stays/webhooks/payments/mock` | | Payments | Dev/mock only |
| Sumsub webhook | Identity KYC | | Compliance | HMAC digest |
| Public ICS export | `GET .../stays/calendar/:token` | | Stays | Capability URL |
| Postgres Identity | `127.0.0.1:5433` | private | Ops | Never public |
| Postgres Stays | `127.0.0.1:5434` | private | Ops | Never public |
| Redis | `127.0.0.1:6379` | private | Ops | Never public |
| Media / S3 | media-service | private | Platform | Signed URLs |
| SSH | bastion only | | Ops | Key-only |
| Cloudflare / CDN | edge | | Ops | Cache rules |
| Vercel / host | web deploy | | Web | |
| GitHub Actions | CI runners | | Eng | Secrets in GH only |
| Mobile | `nexastays-mobile` | | Mobile | Same APIs |

Rule: **no public endpoint without an owner.**

---

## OWASP Top 10 + API Top 10 (mapped)

| Control | Nexa surface | Status |
| --- | --- | --- |
| A01 Broken access control / API1 BOLA | Host listings, bookings, calendar, CSV, intents | See BOLA matrix + Jest suite |
| A02 Cryptographic failures | JWT RS256, refresh pepper, CMI HMAC | Verify prod keys |
| A03 Injection | TypeORM + DTO validation | Fuzz + review |
| A04 Insecure design | Booking/payment races | Financial + double-book tests |
| A05 Misconfiguration | CORS, Swagger, mock provider | Prod boot checks |
| A06 Vulnerable components | npm audit + OSV/Trivy | CI |
| A07 Auth failures | OTP, JWT, refresh reuse | Identity suite |
| A08 Integrity failures | Webhooks, mass assignment | CMI + DTO whitelist |
| A09 Logging failures | Request id, security-traffic | IR checklist |
| A10 SSRF | ICS URL fetch | `validateOutboundHttpsUrl` |
| API2 Broken auth | JWT/refresh | Manual + tests |
| API3 Broken object property (mass assignment) | Listing/booking PATCH | DTO + tests |
| API4 Resource consumption | Throttler | Rate-limit tests |
| API5 BFLA | Guest→host, host→admin | Role tests |

---

## BOLA matrix (object × CRUD)

Wrong principal must get **403 or 404** — never another user’s data.  
Principals: Guest A/B · Host A/B · Admin · anonymous.

| Object | Read | Create | Update | Delete |
| --- | --- | --- | --- | --- |
| Listing (host) | Host A ↛ B | own only | own only | own / admin |
| Booking | guest or listing host | guest | cancel own rules | N/A |
| Review | public listing; edit own | completed guest | own | admin |
| Media / image | public LIVE; host own | host own | host own | host / admin |
| Calendar export token | host own | host own | regenerate own | — |
| External calendar | host own | host own | host own | host own |
| CSV booking export | host own rows | — | — | — |
| Host profile / verification | self | self | self | — |
| Saved / wishlist | self | self | self | self |
| Payment intent | booking guest | booking guest | — | — |
| Admin stays | ADMIN role | ADMIN | ADMIN | ADMIN |

Automated coverage: `backend/stays/src/modules/stays/security/*.spec.ts`.

---

## Mass assignment & privilege escalation

Client must **never** set via body:

`host_user_id`, `host_id`, `is_verified`, `status` (LIVE/APPROVED), `commission`, `role` (account), `account_type`, `payout_amount`, `total_paid`, `ownerId`, `subscription`

Allowed listing fields are whitelisted in `UpdateHostListingDto` / `CreateHostListingDto` (class-validator). Nest should use `whitelist: true, forbidNonWhitelisted: true` globally — verify in `main.ts`.

---

## Financial integrity

| Attack | Expect |
| --- | --- |
| Negative / 0 MAD base price | Reject (`Min(1)` on base_price; publish checks) |
| Client total / discount override | Intent amount = server `booking.total_paid` only |
| Currency change on intent | Locked to booking currency |
| Commission / payout from client | Ignored |
| Mutate amount after intent | Webhook confirms locked intent amount |
| Rounding | Consistent MAD; no underpay |
| Double pay / webhook replay | Idempotent SUCCEEDED |
| Confirm without payment | Impossible when provider ≠ mock |

---

## SSRF (ICS and any outbound URL)

Reject:

- Schemes other than `https:`
- `localhost`, `127.0.0.0/8`, `0.0.0.0`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`
- `::1`, IPv6 ULA/link-local, IPv4-mapped private
- Cloud metadata hostnames (`metadata.google.internal`, `169.254.169.254`)
- `file:`, `ftp:`, `gopher:`, `data:`

Residual: DNS rebinding — prefer resolve-then-validate + block redirects to private (track as accepted risk until hardened).

---

## Cache poisoning

Never cache: Authorization responses, host dashboard, bookings, payment pages.

Expect `Cache-Control: private, no-store` (or CDN bypass) on those routes. Verify with curl + CDN headers.

---

## Frontend security

- No private API keys / JWT secrets in JS bundle
- Only intentional `NEXT_PUBLIC_*`
- No production source maps
- No debug endpoints / stack traces to clients

---

## Finding scorecard

| ID | Severity | Endpoint | Repro | Owner | Due | Retest | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-001 | High | CMI webhook | Unsigned callback accepted without `CMI_STORE_KEY` in non-prod | Stays | 2026-07-19 | 2026-07-19 | Fixed (HMAC fail-closed) |
| SEC-002 | High | ICS sync | Private/metadata SSRF gaps (169.254, IPv6) | Stays | 2026-07-19 | 2026-07-19 | Fixed (`outbound-url.ts`) |
| SEC-003 | High | Listing price | `base_price` allowed 0 MAD | Stays | 2026-07-19 | 2026-07-19 | Fixed (`Min(1)`) |
| SEC-004 | High | Uploads | multer < 2.2.0 nested field DoS | Stays/Identity | 2026-07-19 | 2026-07-19 | Fixed (override 2.2.0 + nesting limit) |
| SEC-005 | High | nexastays_web | Next/picomatch audit highs — needs Next upgrade path | Web | 2026-08-01 | | Open (CI audit warn-only on web) |
| SEC-006 | Medium | typeorm | GHSA orderBy SQLi (MySQL/MariaDB); Nexa uses Postgres | Identity/Stays | | | Accepted until typeorm bump |
| | Critical / High / Medium / Low / Accepted | | | | | | Open / Fixed / Accepted |

**Launch rule:** Critical/High fixed + retested. Medium/Low may be Accepted with owner + expiry.

Template for Phase 6: [security/PHASE6_ATTACK_SIM.md](./security/PHASE6_ATTACK_SIM.md).

---

## Scanner & fuzz runbooks

### Secrets

```bash
# from repo root or backend/
gitleaks detect --source . --config gitleaks.toml --verbose
```

Manual review: JWT PEMs, CMI, SMTP, AWS, Cloudflare, Mapbox, Sentry, Vercel, Railway, Docker compose defaults, weak `.env.example` keys.

### Dependencies

```bash
cd backend/stays && npm run audit
cd backend/identity && npm run audit
cd nexastays_web && npm run audit
# OSV (install osv-scanner) / Trivy
npm run audit:osv   # if script present
npm run audit:trivy # if script present
```

### ZAP (staging)

```bash
docker run --rm -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t "$STAGING_STAYS_BASE" -r zap-stays.html
```

Active scan with scripted Bearer JWT after baseline.

### Nuclei

```bash
nuclei -u "$STAGING_STAYS_BASE" -tags http,cve,misconfig -o nuclei-stays.txt
```

### nmap

```bash
nmap -sV -p- "$PUBLIC_SERVER_IP"
# Expect 22,80,443 only — fail if 5432/5433/5434/6379/9200/27017 open
```

### API fuzzing (Schemathesis / ffuf)

```bash
# Export OpenAPI from non-prod Swagger JSON, then:
schemathesis run http://127.0.0.1:3002/api/docs-json \
  --header "Authorization: Bearer $TOKEN" \
  --checks all

ffuf -u http://127.0.0.1:3002/api/v1/FUZZ -w common-api-paths.txt -mc 200,204,401,403
```

Fuzz payloads: long strings, UTF-8, negative IDs, nulls, huge arrays, empty JSON, duplicate fields, bad enums, oversized multipart. Treat unexpected **500** as High until fixed.

Details: [security/FUZZING.md](./security/FUZZING.md).

---

## Phase 3 — Manual red-team (2–3 days)

1. Full BOLA walk host + admin  
2. Mass assignment / privilege escalation (Burp)  
3. Booking → intent → callback → confirm-without-pay  
4. Financial tamper + webhook amount change  
5. ICS token leakage + SSRF edge cases  
6. Upload content-type / malware  
7. Identity OTP / PIN / admin  
8. XSS + CSP + frontend bundle  

**Known verify items**

| Item | Expected |
| --- | --- |
| Access JWT after logout | Valid until TTL; refresh revoked (accepted short TTL) |
| CMI without `CMI_STORE_KEY` | Callback **invalid** (fail closed) |
| Mock webhook outside mock+non-prod | 403 |
| Host routes | Ownership enforced even without Host role guard |

---

## Phase 4 — Infra / Docker / backups / IR

- DB/Redis private SG only; nmap clean  
- Docker: non-root, minimal image, no privileged, drop caps  
- TLS/HSTS/`ENFORCE_HTTPS`; Swagger off; strict `CORS_ORIGINS`  
- **Restore drill:** restore Identity + Stays dump; record RTO/RPO  
- IR: can answer who / when / IP / user / listing / booking / request id?

---

## Phase 5 — External pentest

Brief with this inventory + scorecard. Scope: BOLA, payments, races, calendar, uploads, financial integrity, rate limits.

---

## Phase 6 — Malicious host/guest simulation

One full day; see [security/PHASE6_ATTACK_SIM.md](./security/PHASE6_ATTACK_SIM.md). Launch gate: scorecard Critical/High cleared.

---

## CI hooks

- Gitleaks on PR (monorepo / backend workflow)  
- `npm run audit` on stays, identity, web  
- OSV/Trivy scripts documented; optional CI step  
- Security unit tests via `npm test` in Stays  

---

## Launch gates (security)

- [ ] Phase 0 inventory URLs filled for staging/prod  
- [ ] BOLA / mass-assignment / financial Jest suites green  
- [ ] Gitleaks clean; high npm/OSV issues triaged  
- [ ] CMI HMAC fail-closed; mock webhook disabled in prod  
- [ ] SSRF checklist satisfied for ICS  
- [ ] nmap clean on public IP  
- [ ] Backup restore drill measured  
- [ ] Phase 6 scorecard: no open Critical/High  
- [ ] External pentest scheduled or Accepted with date  

Cross-link: add these to PRODUCTION_READINESS launch gates.
