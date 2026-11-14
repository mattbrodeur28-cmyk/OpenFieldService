# ADR-0003: Transactional standalone Dispatcher module

Date: 2026-11-14
Status: Accepted for the standalone single-company SQLite deployment.
Feature IDs: DISPATCH-001 through DISPATCH-009; broader M2 remains separate.

## Decision

The requested M3 work precedes the full M2 data-platform migration. Add a bounded
`src/server/dispatch` module with a synchronous repository, checksummed additive
migration, transaction boundary, durable revision events and assignment audit.
Keep Hono transport, date/time validation and storage migration in separate files.
Reuse existing jobs and technicians so current service records remain intact.

Use one existing job schedule as the current appointment projection. Require
expected versions, serialize assignments using SQLite BEGIN IMMEDIATE, and guard
managed appointments with SQL triggers so older job routes cannot silently collide.
Keep schedule validation in the standalone service and expose a narrow validation
hook to the legacy job update route. Do not spread module-table SQL across unrelated
controllers; the legacy route contains only the compatibility version predicate.

Use SSE as an invalidation channel and re-fetch a complete consistent snapshot;
durable revision IDs handle reconnects. Polling is a fallback. Do not claim a
multi-replica event broker, distributed locks or PostgreSQL support from this design.

## Consequences

This delivers the requested scheduling workflow while preserving a module boundary
for later repositories/PostgreSQL. SQLite remains one application instance with a
persistent local volume. A database migration checksum mismatch fails startup;
future migration changes require a new version rather than editing an applied step.

Declared resource availability, administrative override reasons and assignment
audits are implemented. Full entity audit retention, worker queues, multiple visits,
routing and automated resource optimization remain separate milestones.

See [API/operating rules](../../api/dispatcher.md) and the
[release evidence](../../releases/2026-11-14-dispatcher.md). Back up both SQLite
databases and private environment configuration before deploying. Roll back with
matching code and a verified backup during maintenance if necessary; old application
code does not provide the new version contract.
