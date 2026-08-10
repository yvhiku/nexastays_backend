# Nexa Stays — VPS deployment architecture

How the full Nexa Stays ecosystem maps onto a single VPS behind **Cloudflare** and **Nginx**, including **Platform** services that sit beside Identity and Stays.

Related:

| Doc | Role |
|-----|------|
| [`README.md`](./README.md) | Index for this folder |
| [`../../../docs/ECOSYSTEM_ARCHITECTURE.md`](../../../docs/ECOSYSTEM_ARCHITECTURE.md) | Full product/service reference |
| [`../../../docs/DEPLOYMENT.md`](../../../docs/DEPLOYMENT.md) | Env vars, bring-up, health probes |
| [`../../deploy/VPS_DOGFOOD.md`](../../deploy/VPS_DOGFOOD.md) | Blank VPS → first boot runbook |
| [`../../deploy/README.md`](../../deploy/README.md) | Release images + Compose package |
| [`../../../platform/README.md`](../../../platform/README.md) | Event bus, notifications, media, consumers |

**Status:** Documented target architecture. Live host deployment is **NOT VERIFIED**.

---

## 1. What we have (inventory)

Nexa Stays is a multi-repo workspace. Each product/service is independently versioned; they deploy together on one VPS for dogfood / soft-launch.

### 1.1 Repositories / packages

| Path | Role | Deployed as |
|------|------|-------------|
| `backend/identity` | SSO, OTP/PIN, JWT (RS256), KYC, JWKS, identity snapshots | Docker image `nexa-identity` → `:3001` |
| `backend/stays` | Listings, hosts, bookings, payments, admin APIs | Docker image `nexa-stays` → `:3002` |
| `platform/notifications-service` | Push / email / SMS from domain events | Process/container → `:3003` |
| `platform/media-service` | Uploads + HMAC signed URLs (local or S3) | Process/container → `:3004` |
| `platform/consumers` | Analytics, audit, fraud stub, identity-cache invalidation | Background worker (no public port) |
| `platform/event-bus` | `@nexa/event-bus` — Redis Streams, contracts, retry/DLQ | **Library** (built into apps) |
| `platform/telemetry` | `@nexa/telemetry` — structured logs / tracing | **Library** |
| `platform/identity-read-model` | Redis-cached identity snapshots for Stays | **Library** |
| `database/identity` | Postgres schema + migrations (`nexa_identity`) | Postgres → host `:5433` |
| `database/stays` | Postgres schema + migrations (`nexa_stays`) | Postgres → host `:5434` |
| `database/docker-compose.yml` | Identity DB + Stays DB + Redis | Data plane on VPS |
| `nexastays_web` | Guest / host Next.js marketplace | Node on host or container → e.g. `:3005` |
| `nexastays_dashboard` | Ops / admin Next.js UI | Node on host or container → e.g. `:3006` |
| `nexastays-mobile` | Flutter app | App stores (talks to public HTTPS APIs) |
| `nexastays-waitlist-web` | Marketing / waitlist (optional) | Separate static or Node site |
| `backend/deploy` | Release Compose, scripts, edge examples | Synced to `/opt/nexa/backend/deploy` |

### 1.2 Logical products

```
                    Nexa Identity (SSO)
              users · auth · OTP · sessions · KYC
                    PostgreSQL (nexa_identity)
                        │
              JWT (slim) + JWKS + snapshot API
                        │
                        ▼
                   Nexa Stays
              listings · bookings · payments
                    PostgreSQL (nexa_stays)
                        │
                        ▼
              Platform (shared infrastructure)
     Redis event bus · notifications · media · consumers
```

Identity is shared SSO for the ecosystem. Stays is the product. Platform is shared infra used by Stays (and future products).

---

## 2. Target VPS topology (recommended)

ChatGPT’s edge shape is correct for a single VPS. **Platform must be included** on the internal network — it is not optional for a complete dogfood (events, notifications, media).

```
                         Internet
                            │
                       Cloudflare
                     (DNS · WAF · CDN)
                            │
                          HTTPS
                            │
                     ┌──────▼──────┐
                     │    Nginx    │   ← TLS terminate (or Cloudflare Full Strict)
                     │  (edge)     │     Public: 80/443 only on the VPS
                     └──────┬──────┘
            ┌───────────────┼───────────────┐
            │               │               │
            ▼               ▼               ▼
         Web             Dashboard         API edge
    nexastays_web   nexastays_dashboard   /api routes
       :3005              :3006         (or hostnames)
            │               │               │
            └───────────────┼───────────────┘
                            │
                   Internal network
                   (127.0.0.1 / Docker)
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
          ▼                 ▼                 ▼
      Identity           Stays            Platform
       :3001             :3002        :3003 notifications
          │                 │         :3004 media
          │                 │         consumers (worker)
          │                 │                 │
          └────────┬────────┴────────┬────────┘
                   │                 │
                   ▼                 ▼
            PostgreSQL ×2          Redis
         identity :5433           :6379
         stays    :5434        (event bus + caches)
```

### 2.1 Why this shape

| Layer | Responsibility |
|-------|----------------|
| **Cloudflare** | Public DNS, DDoS/WAF, optional CDN for static assets, hide origin IP |
| **Nginx** | Reverse proxy, TLS, host-based routing, security headers, rate limits at edge |
| **Web / Dashboard** | Browser UIs only — no direct DB access |
| **Identity / Stays** | Product APIs — bind to `127.0.0.1`, never public |
| **Platform** | Notifications, media, event consumers — internal only |
| **Postgres ×2** | One DB per product (Identity ≠ Stays). Never exposed publicly |
| **Redis** | Event streams + identity read-model cache. Never exposed publicly |

### 2.2 Edge: Nginx vs Caddy

| Option | Status in repo |
|--------|----------------|
| **Nginx** (this target doc) | Recommended for the Cloudflare → Nginx topology |
| **Caddy** | Example only: `backend/deploy/edge/Caddyfile.dogfood.example` |

Pick **one** reverse proxy on the VPS. Do not run Nginx and Caddy both on `:80`/`:443`.

---

## 3. Public hostnames (example)

Replace `example.com` with real dogfood/staging/production domains after DNS is ready.

| Hostname | Upstream | Notes |
|----------|----------|-------|
| `www.example.com` / `app.example.com` | `127.0.0.1:3005` | `nexastays_web` |
| `dashboard.example.com` | `127.0.0.1:3006` | `nexastays_dashboard` |
| `identity.example.com` | `127.0.0.1:3001` | Identity API (`/api/v1/...`) |
| `stays.example.com` / `api.example.com` | `127.0.0.1:3002` | Stays API |

**Do not publish hostnames for:** Postgres, Redis, notifications (`:3003`), media internal APIs (`:3004`), consumers, MinIO/restore ports, metrics scrapers.

Clients (web, dashboard, mobile) call Identity + Stays over HTTPS with Bearer JWTs. Platform is reached only by backends via `INTERNAL_SERVICE_KEY` and Redis.

### 3.1 Nginx sketch (host-based)

```nginx
# TLS terminated at Nginx (origin cert or Let's Encrypt).
# Cloudflare SSL mode: Full (strict) when using a trusted origin cert.

upstream nexa_web        { server 127.0.0.1:3005; }
upstream nexa_dashboard  { server 127.0.0.1:3006; }
upstream nexa_identity   { server 127.0.0.1:3001; }
upstream nexa_stays      { server 127.0.0.1:3002; }

server {
  listen 443 ssl http2;
  server_name app.example.com;
  # ssl_certificate …;
  location / {
    proxy_pass http://nexa_web;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

server {
  listen 443 ssl http2;
  server_name dashboard.example.com;
  location / { proxy_pass http://nexa_dashboard; /* same proxy headers */ }
}

server {
  listen 443 ssl http2;
  server_name identity.example.com;
  location / { proxy_pass http://nexa_identity; /* same proxy headers */ }
}

server {
  listen 443 ssl http2;
  server_name stays.example.com;
  location / { proxy_pass http://nexa_stays; /* same proxy headers */ }
}
```

Web/dashboard env (build-time / runtime as applicable):

```env
NEXT_PUBLIC_IDENTITY_API_BASE_URL=https://identity.example.com/api/v1
NEXT_PUBLIC_STAYS_API_BASE_URL=https://stays.example.com/api/v1
NEXT_PUBLIC_SITE_URL=https://app.example.com
```

---

## 4. Internal services (Platform + data)

ChatGPT’s diagram stopped at Identity / Stays / PostgreSQL. On this stack you also run:

```
Identity (:3001) ──publish──► Redis Streams
Stays    (:3002) ──publish──► Redis Streams
                │
                ├──► notifications-service (:3003)   FCM / email / SMS
                ├──► consumers                         analytics · audit · fraud · cache
                └──► identity-read-model (in-process)  Redis cache ← kyc.updated.v1

Stays ──HTTP──► media-service (:3004)   when MEDIA_SERVICE_URL is set
                (required for NEXA_ENV=production uploads)
```

| Component | Port | Public? | Depends on |
|-----------|------|---------|------------|
| Identity | 3001 | Via Nginx hostname only | Postgres identity, Redis (optional for some paths) |
| Stays | 3002 | Via Nginx hostname only | Identity JWKS, Postgres stays, Redis, platform URLs |
| Notifications | 3003 | **No** | Redis, Firebase (push), Identity for tokens |
| Media | 3004 | **No** (signed URLs may point at CDN/S3) | Storage backend, `INTERNAL_SERVICE_KEY` |
| Consumers | — | **No** | Redis |
| Postgres identity | 5433 | **No** | Volume + strong password |
| Postgres stays | 5434 | **No** | Volume + strong password |
| Redis | 6379 | **No** | Volume (persistence policy TBD) |

### 4.1 Dual Postgres (not one shared DB)

| Database | Port (host) | Owner |
|----------|-------------|-------|
| `nexa_identity` | 5433 | Identity only |
| `nexa_stays` | 5434 | Stays only |

Stays never joins Identity tables. Guests/hosts are opaque UUIDs from Identity JWT `sub`. Cross-service identity data goes through JWT + snapshot / read-model APIs.

---

## 5. On-VPS filesystem layout

Canonical paths from the dogfood package:

| Path | Contents |
|------|----------|
| `/opt/nexa/backend/deploy` | Release Compose, scripts, host `.env*` |
| `/opt/nexa/database` | DB compose, migrations, backup scripts |
| `/opt/nexa/platform` | Optional checkout for notifications/media/consumers |
| `/opt/nexa/web` / `/opt/nexa/dashboard` | Optional Next.js apps |
| `/opt/nexa/deploy` | Operator-owned Nginx/Caddy config notes |
| `/opt/nexa/backups` | Backup staging |
| `/etc/nexa/backup.env` | Backup secrets (host-owned) |

**Host-owned (never overwritten by CI rsync):** `.env`, `.env.identity`, `.env.stays`, Nginx/Caddy live config, TLS PEMs, backup env.

**CI-owned:** `docker-compose.release.yml`, deploy scripts, `env/*.example`, edge **examples**.

---

## 6. Bring-up order on the VPS

Always start dependencies before apps:

1. **Host** — Docker Engine + Compose; `/opt/nexa` bootstrap (`vps-bootstrap.sh`)
2. **Data plane** — Identity Postgres + Stays Postgres + Redis (`database/docker-compose.yml`)
3. **Migrations** — `migrate-remote.sh` (or equivalent) against both DBs
4. **Platform packages** — build libs; start notifications, media, consumers
5. **Identity** — must be healthy (JWKS) before Stays accepts traffic
6. **Stays** — release Compose (`docker-compose.release.yml`)
7. **Web + Dashboard** — Next.js processes/containers
8. **Nginx** — only after real DNS; then Cloudflare → origin
9. **Smoke** — `backend/deploy/scripts/smoke.sh` + dogfood checklist
10. **Backups** — validate one manual backup before enabling the timer

Detailed commands: [`../../deploy/VPS_DOGFOOD.md`](../../deploy/VPS_DOGFOOD.md).

---

## 7. Traffic and trust boundaries

```
Browser / Mobile
    │  HTTPS + Bearer JWT
    ▼
Cloudflare ──► Nginx ──► Web / Dashboard / Identity / Stays
                              │
                              │  JWKS + INTERNAL_SERVICE_KEY
                              ▼
                         Platform + Redis + Postgres
                         (loopback / Docker network only)
```

| Boundary | Rule |
|----------|------|
| Internet → VPS | Only `80`/`443` (and SSH on a non-default port if you harden later) |
| Nginx → apps | `127.0.0.1:3001–3006` |
| Apps → DB/Redis | Host ports or Docker DNS; firewall deny from WAN |
| Service → service | `INTERNAL_SERVICE_KEY`; never expose that key to browsers |
| Payments (dogfood) | `NEXA_ENV=dogfood` + `STAYS_PAYMENT_PROVIDER=mock` required |

---

## 8. What release Compose covers today vs full stack

Current `backend/deploy/docker-compose.release.yml` runs **Identity + Stays** only (loopback binds). That matches the product APIs.

For a **complete** VPS matching this architecture, also run:

| Piece | How |
|-------|-----|
| Postgres + Redis | `database/docker-compose.yml` (+ VPS env / volumes scripts) |
| Platform HTTP + workers | Compose or systemd under `/opt/nexa/platform` |
| Web + Dashboard | Separate Node/Compose services behind Nginx |
| Nginx | Host package + site configs under `/opt/nexa/deploy` or `/etc/nginx` |
| Cloudflare | DNS A/AAAA (or orange-cloud) to VPS; SSL Full (strict) |

---

## 9. Health and smoke (edge-facing)

| Service | Readiness | Liveness |
|---------|-----------|----------|
| Identity | `GET /api/v1/health/ready` | `GET /api/v1/health/live` |
| Stays | `GET /api/v1/health/ready` | `GET /api/v1/health/live` |

Nginx / Cloudflare origin checks should use **readiness** (returns **503** when DB is down).

Before accepting traffic, confirm Stays can reach Identity JWKS:

`GET https://identity.example.com/api/v1/.well-known/jwks.json`

---

## 10. Soft-launch (dogfood) vs production

| Concern | Dogfood / staging | Production |
|---------|-------------------|------------|
| Payments | **Mock required** | Real CMI only when gated; mock rejected |
| Media | Local or S3 | `MEDIA_STORAGE_BACKEND=s3` + fail-closed |
| Identity uploads | Dev-friendly | `IDENTITY_DISABLE_LOCAL_UPLOADS=true` |
| Images | Immutable `:git-sha` | Same — never `:latest` as release identity |
| Backups | Install + one successful run | Nightly timer + off-host copy |
| Claim “live” | Only after DNS + TLS + smoke on the real host | Same + production approval workflow |

---

## 11. Diagram — full stack (ASCII)

```
                         Cloudflare
                              │
                           Nginx :443
          ┌───────────┬───────┴───────┬───────────┐
          │           │               │           │
         Web      Dashboard       Identity      Stays
        :3005       :3006          :3001        :3002
          │           │               │           │
          └───────────┴───────┬───────┴─────┬─────┘
                              │             │
                         Platform      Data plane
                    ┌─────────┼─────┐   ┌───┴────┐
                    │         │     │   │        │
                 notify    media  consumers  PG×2  Redis
                  :3003    :3004   worker   5433/  :6379
                                            5434
```

---

## 12. Quick map — “ChatGPT diagram” → Nexa reality

| ChatGPT box | Nexa component(s) |
|-------------|-------------------|
| Cloudflare | DNS / WAF / CDN in front of the VPS |
| Nginx | Host reverse proxy (TLS + routing) |
| Web | `nexastays_web` |
| Dashboard | `nexastays_dashboard` |
| API | Split into **Identity** (`:3001`) + **Stays** (`:3002`) — not one monolith API |
| Identity | `backend/identity` |
| Stays | `backend/stays` |
| PostgreSQL | **Two** databases: `nexa_identity` + `nexa_stays` |
| *(missing)* | **Platform**: notifications, media, consumers + **Redis** event bus |
| *(clients)* | `nexastays-mobile` uses the same public Identity/Stays HTTPS URLs |

---

*This file describes the target VPS architecture for dogfood and beyond. Execution steps live in `backend/deploy/VPS_DOGFOOD.md`; service deep-dives live in `docs/ECOSYSTEM_ARCHITECTURE.md`. Workspace mirror: `docs/deploy/VPS_ARCHITECTURE.md`.*
