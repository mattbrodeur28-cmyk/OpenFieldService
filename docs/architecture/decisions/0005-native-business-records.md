# ADR-0005: Native business records across platform apps

Date: 2026-11-14
Status: Accepted direction; current single-instance SQLite implementation is partial.

## Decision

Apps are modules of one business platform. CRM owns customers/contacts/sites;
equipment owns equipment identity/history; service owns jobs and work classification;
Dispatch owns planned assignments and schedule policy; Sales owns opportunities and
quotes; agreements own coverage; collaboration owns messages; identity owns users;
inventory will own stock movements; accounting owns approved export mappings.
QuickBooks remains the accounting system of record. No app clones another app's
customer, job, technician, equipment or material master.

Use stable existing UUID references, foreign keys where a transactionally shared
database permits, inverse record navigation and authenticated application services.
Snapshots are deliberate versions of accepted scope/pricing/evidence, never a second
editable master. Identify every projection's authoritative source and update rules.
Cross-module handoffs inside the service database must commit source/target links,
version checks and audit atomically. External accounting/provider effects require
an outbox, idempotency and reconciliation; an HTTP success alone is not an accounting
transaction. Do not fan out writes from browser components to simulate atomic work.

## Current implementation and limits

Sales customer/site/equipment references are foreign keys to original business
records. Customer context queries join opportunities/follow-ups back to that customer;
renaming the customer is immediately reflected without copying. Direct Sales links
open the same opportunity. Sales activities reference that opportunity and existing
user IDs. Team message links retain IDs, check message read permissions on linking
and do not copy private bodies into company-readable Sales data.

Users and collaboration currently live in workspace.sqlite; business records live in
the service database. Cross-file user/message links have application validation,
not SQL foreign keys or distributed transactions. Archived/deactivated identities
must remain historically identifiable; do not hard-delete them. ARCH-005 must plan
UUID-preserving PostgreSQL migration of both stores, identity/message deletion rules,
capability enforcement, migration deployment and restoration before multi-replica
Kubernetes qualification. This ADR does not claim that migration is implemented.

Service work categories use `_service_work.job_id → jobs.id`. Dispatcher consumes
that authoritative category and a trigger-maintained emergency state projection.
Classification and schedule/audit changes share one synchronous transaction. Existing
job duration is explicitly a planning estimate; reports/time ledgers are forthcoming
and must not silently repurpose it as actual labor or payroll.

## Review gates for every new app

- Name owned records, references, immutable snapshots and derived projections.
- Add reverse links and define authorization at the service/API boundary.
- Specify transaction, stale-version and retry/idempotency behavior before writes.
- Preserve populated fixtures and demonstrate linked updates without duplication.
- Document single-instance limits, future repository contracts and rollback behavior.

A modular monolith with clear ownership is chosen over separate app databases or
premature microservices. SQL adapters remain migration targets under ARCH-003;
company-wide Sales read visibility remains the published limitation in SALES-012.
