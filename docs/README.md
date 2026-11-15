# Documentation index

Start with [Features.md](../Features.md) for the product direction, feature IDs,
milestone sequence, acceptance criteria and definition of done.

## UI architecture and development

- [ADR-0001: selected UI system and compatibility strategy](architecture/decisions/0001-ui-system.md)
- [ADR-0002: Radix Dialog/Tabs compatibility slice](architecture/decisions/0002-radix-preact-pilot.md)
- [Shared UI primitives release evidence](releases/2026-11-14-ui-primitives.md)
- [UI component and interaction implementation guide](development/ui-system.md)

- [Dispatcher architecture decision](architecture/decisions/0003-dispatcher-module.md)
- [Dispatcher API and operating rules](api/dispatcher.md)
- [Dispatcher and workspace UI release evidence](releases/2026-11-14-dispatcher.md)

- [Sales foundation architecture decision](architecture/decisions/0004-sales-foundation.md)
- [Sales API, ownership and forecast rules](api/sales.md)
- [Sales foundation release evidence](releases/2026-11-14-sales-foundation.md)

## Current guides

- [Overview and local workflow](../README.md)
- [Debian 13 / Proxmox LXC deployment](../deploy/README.md)
- [Accounts, roles, teams and recovery](../deploy/ACCOUNTS.md)
- [AI, knowledge and reviewed App Builder deployment](../deploy/WORKSPACE.md)
- [Google, Microsoft, HubSpot and LinkedIn configuration](../deploy/INTEGRATIONS.md)

## Maintainer reference

- [Architecture and module ownership](architecture/overview.md)
- [Domain glossary](product/glossary.md)
- [Development and delivery standard](development/delivery.md)
- [ADR template](architecture/decisions/template.md)
- [API contract map](api/README.md)
- [Security and permission matrix](security/permissions.md)
- [Operations and recovery](operations/runbook.md)
- [M0 / M1 release record](releases/2026-11-14-workspace.md)

Complete generated workspace API contracts, versioned migrations, durable audit,
PostgreSQL and Kubernetes qualification remain planned in Features.md.

- [Inventory and company cost release evidence](releases/2026-11-15-inventory.md)
- [Fleet and Purchasing design and owner decisions](product/fleet-and-purchasing.md)
