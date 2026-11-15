# Customer contacts, relationship summary, and business navigation

CRM-001 and the core CRM-002 projection run in standalone Node/SQLite. Customer
profiles include contacts with roles/preferences and archive/restore, versioned
classification, parent accounts, billing relationships, and a live native-record
summary. CRM remains under Customers. Communications, proposals, agreements, and
full activity are not complete, so the full CRM-002 roadmap item remains open.

## Data and access

No customer/site/job/material copy is created. Account, contact, location, equipment,
Sales and invoice summaries use their owning records. Sales totals join real stage
rows; invoice debt excludes drafts/cancellations. The summary uses one deferred
read transaction and returns null for optional modules that are not installed.

Active company users read CRM. Owner/Admin/Member write; Viewer reads only. HR
alone grants no additional CRM or accounting access. HTTP writes recheck actors
after asynchronous bodies, scope contacts to the path account, require contact
and classification versions, and reject cross-account sites/parent cycles.

Original migration v1 is preserved. Additive v2 introduces classification versions
and immutable audit triggers. Back up service and platform databases before an
upgrade. Recovery requires restoring a consistent tested backup; do not drop CRM
tables or delete migration records to simulate rollback.

## Navigation

Sales, Fleet, HR, and Finance have expandable groups and overview pages. Section open/closed preferences persist per user in browser storage, including Field Service. Existing
pipeline, vehicles/maintenance, truck stock, staff accounts, invoices, and POs keep
their native backends. Quotes, GPS, onboarding, personnel documents, receivables
aging, and liabilities explicitly show planned states.

Schedule sits above the Work pipeline on Dispatcher, without a separate tab/page. The board has native Add job; Home uses the same
weekly schedule without job creation. Material catalog moves inside Inventory.
Equipment selection requires choosing a customer's Location, then searches assets
within that location. Step 2 still requires equipment on the server.

## Qualification

CRM coverage includes real Sales composition, invoice statuses, absent modules,
scoped paths, stale versions, actor revocation during streamed bodies, 413 limits,
immutable audits, rollback, parent cycles, and populated v1-to-v2 migration.
Equipment integration covers native location filtering and foreign-location refusal.
Browser and exact release-snapshot validation are recorded with the release commit.
A successful local build/test is not LXC, provider, or multi-replica qualification.

Single-instance SQLite, company-wide CRM visibility, no contact import/merge or
communications delivery, no HR personnel storage, and no live GPS remain limits.

Local verification for this increment: 137 tests pass, TypeScript is clean, and Vite
build succeeds (the existing >500 kB main-chunk warning remains). Real Chrome
checks confirmed HR/Sales overviews, disclosure collapse and refresh persistence,
native Fleet truck stock, Finance invoice routing, Home weekly overview without
creation controls, and Dispatcher week/day selection driving the technician board.
Contacts were created in the disposable preview with immediate summary refresh.
The LXC and provider services were not changed or qualified by these checks.
