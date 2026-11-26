# ADR-0007: Extensible business platform direction

Date: 2026-11-25
Status: Accepted target direction from owner request; implementation incomplete.

## Context and references

The owner wants Twenty CRM-style extensibility and Salesforce-like business module
breadth, while keeping deployment independent and self-hosted. UI modules alone do
not provide that platform. Native customers, locations, equipment, work orders,
stock and business histories must remain shared across the requested M4, M2, Sales,
Contracts, Projects, Commercial/Construction, M12 and M13 tracks.

Twenty's own documentation describes objects/fields/relations and first-class custom
objects with APIs, views, permissions and workflow triggers:
[Data model](https://github.com/twentyhq/twenty/blob/main/packages/twenty-docs/getting-started/core-concepts/data-model.mdx).
Its documented extension model includes app-owned definitions, fields on existing
objects, roles and workflows:
[Apps](https://github.com/twentyhq/twenty/blob/main/packages/twenty-docs/getting-started/core-concepts/apps.mdx).
These are architectural references, not a claim of compatibility, parity or an
instruction to copy Twenty's implementation. No Twenty dependency or runtime is
introduced by this decision.

## Decision

Use the existing modular-monolith ownership direction (ADR-0005) and build a common
platform layer beneath the business modules. PostgreSQL is the intended shared-state
production target for independently replicated API/worker deployments; SQLite stays
a supported single-instance LXC profile until a separately qualified migration and
support policy changes it. PostgreSQL adapters, migration and Kubernetes qualification
are not implemented by adopting this target.

1. **Record model and module contracts.** Stable module/object/field IDs, ownership,
   native IDs, inverse relations, lifecycle/version rules and capabilities. Standard
   objects retain business-owned tables/commands. Module enable/disable must retain
   relationships/history and define dependencies; disabling a module cannot delete
   another module's referenced business records.
2. **Metadata and custom fields.** Versioned, admin-reviewed field definitions and
   relation metadata, with documented value types, validation, indexing/search policy,
   default/backfill/rename/archive and export behavior. Field removal preserves old
   history. Protected financial, safety and identity fields keep their owning command
   invariants. Metadata changes cannot bypass schema review or inject arbitrary SQL.
3. **Authorization.** Central capabilities at service boundaries with object/field/
   record access, owner/team scopes and filtered queries/search/exports. HR remains
   people-only. Workers, AI, imports and API tokens receive explicit scoped identities;
   privileged user access does not automatically become an app or worker permission.
4. **Views and layouts.** Saved typed filters/sorts/columns, Kanban stage mapping,
   record layouts and dashboards that consume the same schema/access rules. A saved
   view cannot reveal a hidden field via grouping, counts, search or downloads.
5. **Workflow engine.** Versioned drafts, reviewed activation, typed triggers/steps,
   explicit approval boundaries and transactional domain events/outbox. Durable job
   leases, bounded retry/backoff, dead-letter review and effect idempotency. Preserve
   execution input/version/actor/outcome. Customer acceptance, bank payments and
   safety approval require their actual evidence and authorized business commands.
6. **API and applications.** Published/versioned OpenAPI, consistent pagination,
   errors, correlation IDs, compatibility rules and scoped app credentials. Custom
   object APIs are generated/registered from reviewed metadata and use the same
   validation, transactions and policy enforcement as standard records. App Builder
   changes go through isolated preview/migration/review/deploy boundaries.
7. **Data and operations.** PostgreSQL adapters/unit-of-work and UUID/history/key
   preservation from both existing databases; private local/S3 documents; separate
   stateless API and durable workers; externalized shared state and secrets; backup/
   restore, observability, health/readiness, upgrades and documented rollback.

Financial ledgers remain exact-money domain records. Accepted documents are immutable
snapshots; Customer360/forecast/stage age are source-labelled read projections.
Metadata extensibility does not make quote acceptance, stage movement, contract
activation, inventory receipt and external payment the same operation.

## Delivery and qualification

ARCH-015–022 track these platform capabilities alongside existing ARCH-001–014.
First prove typed module ownership/native transactional handoffs (current CRM/Sales
source), then repository/policy and metadata foundations, then views/workflows/apps.
Business features may advance alongside those foundations if they use the shared
contracts and document their remaining single-instance limits. No wholesale rewrite
or record duplication is authorized as a shortcut to visual similarity.

A platform feature is complete only with meaningful module/security/concurrency/
migration tests, operator documentation and appropriately scoped browser/runtime
proof. PostgreSQL, independent replicas, provider effects, physical hardware and
production deployment each need their own evidence. Testing is currently deferred
by the owner; these requirements remain open and no parity claim is made.
