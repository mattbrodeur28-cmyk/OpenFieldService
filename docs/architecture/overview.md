# Architecture and module map

This describes the current standalone implementation, not the planned enterprise backend.

## Request and storage flow

`node.ts` starts Hono, creates the service SQLite adapter and workspace services,
mounts authentication before every `/api/*` handler, serves built Vite assets and
supports SPA bookmarks. `/healthz` checks the service database only; it does not
prove AI/OAuth availability or workspace database health.

| Responsibility | Implementation | Persistence / contract |
| --- | --- | --- |
| HTTP composition, static assets, shutdown | `src/server/node.ts` | Node 24; single process |
| Business records and validation | `src/server/index.ts`, `db.ts` | `schema.sql`; `/api/openapi.json` |
| Standalone service storage | `src/server/sqlite.mjs` | `DATABASE_PATH`, default `data/openfieldservice.sqlite` |
| Dispatcher | `src/server/dispatch/` | Checked module migration, atomic assignments, audit, durable SSE revisions |
| Sales | `src/server/sales/`, `src/server/platform/sqlite.mjs` | Opportunities/stages, checked migrations, atomic writes/audit; [Sales API](../api/sales.md) |
| Private native documents | `src/server/documents/` | Private bounded SQLite BLOB adapter, native FK links, tags/audit; [ADR-0006](decisions/0006-private-documents.md) |
| Native Purchasing | `src/server/purchasing/` | Supplier/PO/issued terms, atomic accepted receipts into inventory, immutable replay/audit; [release](../releases/2026-11-15-purchasing.md) |
| Native Fleet and maintenance | `src/server/fleet/` | Shared truck custody/inventory, checked migration and atomic service history; live GPS planned |
| Native inventory and company valuation | `src/server/inventory/` | Checked migrations; stock/custody/movement ledger, native job usage and atomic company repricing |
| Identity, sessions, users, HR, teams | `src/server/auth.mjs` | `workspace.sqlite`, beside service DB |
| AI, Knowledge, configuration, Builder | `src/server/workspace.mjs` | workspace DB; scoped proposal files |
| OAuth and provider reads | `src/server/integrations.mjs` | workspace DB; encrypted per-user tokens |
| Browser identity / navigation | `src/client/auth.tsx`, `app.tsx`, `hooks/use-router.ts` | session cookies; URL routing |
| Profile, team channel, Builder | `components/profile-popup.tsx`, `team-channel.tsx`, `builder-page.tsx` | corresponding authenticated APIs |
| Field cache | `src/client/offline.ts`, `public/service-worker.js` | browser device data, read-only |
| Deployment and recovery | `deploy/`, `scripts/backup-db.mjs` | systemd and SQLite online backups |

Paths in the table are relative to the repository root. The repository maintainer
owns these boundaries; features must name the affected module in their delivery record.

## Deployment constraints

One company and one Node instance own two local SQLite databases. Database creation
and additive workspace upgrades run during startup; the UUID migration is explicit
and rejects unknown custom schema. Dispatcher and Sales have version/checksum migration ledgers. Other legacy
modules still need migration-ledger adoption in M2.
Migration code lives in `scripts/uuid-migration.mjs`, `sqlite.mjs`, `auth.mjs`,
`workspace.mjs` and `integrations.mjs`. Back up both DBs and the private encryption
configuration before upgrades. See [recovery](../operations/runbook.md).

Multiple connections to the workspace file are intentional today. There is no
cross-database transaction, distributed session/rate-limit store or durable worker
queue. Kubernetes multi-replica deployment is not qualified. M2 in Features.md owns
those changes; do not bypass these limits with multiple writable replicas.

## Decision records

Use [the ADR template](decisions/template.md) for runtime, database, API, identity,
provider or UI decisions. Record alternatives, consequences, migration/rollback,
validation and revisit triggers. [ADR-0001](decisions/0001-ui-system.md) sets the UI direction.

## Native app contract

[ADR-0005](decisions/0005-native-business-records.md) defines shared records, module
ownership, projections and transaction boundaries. Service work classification lives
in `src/server/service/work.mjs` and references existing jobs. The
[service operating model](../product/service-operating-model.md) defines On-Demand,
Quoted Work and PM, plus planned PJSA/report/billing, actual time, truck stock and RMS.

Technician account links live in `src/server/service/identity.mjs`, exposed by thin
`service/http.mjs` routes. Identity's `activeWriters` contract supplies eligible IDs
and names to both Sales and service modules; service identity does not read auth
tables or match display names. See [service API](../api/service.md).
