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

- [Extensible Twenty-style business platform direction](architecture/decisions/0007-extensible-business-platform.md)
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

- [Fleet and maintenance release evidence](releases/2026-11-15-fleet.md)

- [Purchasing release evidence](releases/2026-11-15-purchasing.md)
- [Sales estimating and accepted-material purchasing design](product/sales-estimating.md)

- [Private tagged document API](api/documents.md)
- [Document storage decision](architecture/decisions/0006-private-documents.md)
- [Ticket/PO document release evidence](releases/2026-11-15-documents.md)
- [Purchasing API](api/purchasing.md)

## Working-source increments awaiting qualification

- [Typed native custom-field backend](api/custom-fields.md)
- [HR staff and native technician lifecycle](api/hr-staff.md)
- [Person-linked private personnel documents](api/hr-personnel-documents.md)
- [Native module/object contracts and metadata API](api/platform-metadata.md)
- [Prospect to native customer conversion](api/sales-prospect-conversion.md)
- [CRM pipeline progress and current-stage aging](product/crm-pipeline-progress.md)
- [Job costing spreadsheet and clarified multipliers](product/job-costing-spreadsheet.md)
- [Accepted quote to native Job review workflow](product/quote-job-conversion.md)
- [Weekly timesheet and accounting reference links](product/weekly-timesheet-accounting.md)
- [Native Job references and invoice receipts API](api/job-accounting.md)

Testing is currently deferred at the owner's request. These guides describe local
source changes, not published or production-qualified releases.

- [Native agreement draft foundation](api/agreements.md)
- [Revision-bound proposed contract PDFs](api/agreement-documents.md)
- [Frozen agreement offers and recorded responses](api/agreement-lifecycle.md)

- [Automated qualification progress, 2026-11-25](releases/2026-11-25-automated-progress.md)
