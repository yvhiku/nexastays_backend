# Nexa Stays — Deploy docs

Architecture and planning for deploying the Nexa Stays stack on a VPS.

| Doc | Purpose |
|-----|---------|
| [`VPS_ARCHITECTURE.md`](./VPS_ARCHITECTURE.md) | **What we have** + target VPS topology (Cloudflare → Nginx → apps → platform → Postgres) |
| [`../../../docs/DEPLOYMENT.md`](../../../docs/DEPLOYMENT.md) | Full deploy runbook (env, bring-up, health probes) |
| [`../../../docs/ECOSYSTEM_ARCHITECTURE.md`](../../../docs/ECOSYSTEM_ARCHITECTURE.md) | Deep service / DB / platform reference |
| [`../../deploy/VPS_DOGFOOD.md`](../../deploy/VPS_DOGFOOD.md) | First VPS dogfood steps (`/opt/nexa`) |
| [`../../deploy/README.md`](../../deploy/README.md) | Release compose, CI deploy, smoke |

Workspace mirror (same content): `docs/deploy/` at the monorepo root.

**Status:** Architecture and repo packaging are **IMPLEMENTED**. Live VPS cutover remains **NOT VERIFIED** until DNS, TLS, and smoke pass on a real host.
