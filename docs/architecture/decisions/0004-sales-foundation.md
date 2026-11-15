# ADR-0004: Sales opportunities before quote conversion

Date: 2026-11-14
Status: Accepted for the standalone single-company deployment.
Feature IDs: SALES-001/002/003; M4 in progress.

## Context

The owner requested a Salesforce-style Sales app with Kanban, configurable stages,
quotes and conversion to active work. Existing customer/job screens provide no
opportunity lifecycle. The first increment must be useful without pretending a
quote has been accepted or posting estimates into accounting.

## Decision

Add a separate Sales module and shared checked-migration/transaction utility.
Keep opportunity/stage rules and synchronous application services outside HTTP,
with behavioral tests calling services directly. Service queries remain inside the
module; PostgreSQL repositories/unit-of-work remain M2 work. Dispatch reuses the
shared synchronous transaction utility without changing its applied migration SQL.

Use existing customer/site/equipment references, optional prospect/contact fields,
integer USD cents and expected versions. Store Sales and its audit in the service
database for atomic writes. Identity lookups provide only active owner IDs/names
through auth, not direct reads of identity tables. Start with company-wide reads;
limit member writes to their own opportunities and reserve configuration/reopen/
assignment privileges for Owners/Admins. HR confers no administration rights.

Reserve Won for the forthcoming accepted-quote conversion transaction. Open stage
moves never create jobs. Loss/reopen requires a reason. Preserve historical stages
and prevent deletion or semantic changes while occupied. No hard-delete Sales API.

## Consequences and alternatives

A complete CRM/accounting rewrite before any Sales UI would delay the requested
workflow. An unversioned frontend-only Kanban would lose concurrent changes. The
bounded module is chosen; it does not satisfy all M2/CRM/quote requirements.
Multi-currency, team/private visibility, tasks/reminders, quote versions, approvals,
exports and idempotent conversion are later increments. Read-side polling is a
simple ten-second refresh, not a distributed event bus.

No external UI registry source or new runtime dependency is added. Shared Radix
wrappers retain the single Preact runtime. Browser testing exposed generated-ID
collisions across portals; explicit wrapper-owned content/title/option labels now
avoid unrelated accessible text. Sales editor updates preserve the mounted dialog
and pointer-opened card buttons receive focus before opening for reliable return.

## Validation and recovery

See [Sales API/rules](../../api/sales.md) and
[release evidence](../../releases/2026-11-14-sales-foundation.md). Revisit on privacy
requirements, supported currencies, multiple visits/quotes, independent replicas,
new shared primitives or an approved PostgreSQL migration. Back up both databases
and private configuration before deploy; checksum failure requires reviewed source
or a matching backup, never a database reset.
