# CRM accounts and contacts

First M4 Commercial CRM increment (CRM-001). It adds multiple contacts per account, each with
roles and communication preferences, plus billing relationships and account classification.
It runs in the standalone Node/SQLite deployment and needs no provider keys.

The core CRM-002 customer summary is implemented; communications, proposals, agreements, full activity, CRM-005 quotes, and CRM-006 import/merge remain planned. This slice
does not add a customer portal, communications delivery or any accounting behaviour.

## Relationship to the existing customer and site records

Nothing here replaces the foundation:

- `customers` stays the company/account record. We do not duplicate it.
- `sites.contact_name`/`contact_phone`/`contact_email` stays as the legacy single "primary site
  contact" that the equipment screens already display. It is **not** migrated or rewritten, so no
  existing screen changes behaviour. CRM contacts are an additional, richer record.
- `_crm_account_settings` stores segment/account type/parent beside the customer row rather than
  altering it, so the legacy application keeps working without knowing these columns exist.

A contact belongs to an account and may optionally belong to one of that account's sites. A
cross-account site link is rejected (`400`), because it would put a person in the wrong company.

## Permissions

Consistent with current customer-record access: every active signed-in role may read contacts.
Owner, Admin and Member may create/update/archive/restore. Viewers read only. Accounts with a
temporary password must change it first (`401`). Mutations require
`X-Requested-With: OpenFieldService`, enforced by the parent service app.

There is no owner/representative model yet, so CRM-001 does not have per-user record visibility.
Every authenticated company user can read every contact. Do not store information in a contact
that must be isolated between colleagues; that is ARCH-013/M2 work.

## API

Routes are mounted in the service app, so they are under `/api/service`:

| Method/path | Contract |
| --- | --- |
| GET `/customers/:customerId/contacts?includeInactive=&siteId=` | Active contacts for the account, newest-name order. `includeInactive=true` also returns archived people. `siteId` narrows to one site. |
| GET `/customers/:customerId/contacts/by-role/:role` | Active contacts holding one role, e.g. `billing`. |
| POST `/customers/:customerId/contacts` | Create. Returns `{ contact }`, 201. |
| PUT `/customers/:customerId/contacts/:id` | Update; requires `expectedVersion`. Replaces the role set. |
| POST `/customers/:customerId/contacts/:id/archive` | Deactivate with `{expectedVersion}` (idempotent when already inactive). History is kept. |
| POST `/customers/:customerId/contacts/:id/restore` | Reactivate with `{expectedVersion}` (idempotent when already active). |
| GET `/customers/:customerId/billing-links` | Sites this account bills for, or is billed by. |
| POST `/customers/:customerId/billing-links` | Link a billing party to a site. Returns `{ link }`, 201. |
| DELETE `/customers/:customerId/billing-links/:id` | Remove a billing link. |
| GET `/customers/:customerId/account` | Segment, account type and parent. |
| PUT `/customers/:customerId/account` | Save segment/account type/parent with required `expectedVersion` (0 for an unsaved classification). |
| GET `/customers/:customerId/360` | One read-only Customer 360 summary (below). |

Contact input: `name`, `title`, `email`, `phone`, `emailOk`, `phoneOk`, `smsOk`, `notes`,
`siteId` (UUID or null, optional), `roles` (array), `expectedVersion` (updates only). Request
schemas reject unknown fields.

Roles: `billing`, `service`, `accounts_payable`, `site_supervisor`, `estimator`, `other`.

## Validation rules

A contact must be reachable and usable:

- At least an email address or a phone number.
- If it has an email, `emailOk` must be true — an address we refuse to use is not a usable contact.
- If it has *only* a phone, `phoneOk` must be true.
- `smsOk` requires a phone number.
- A `billing` contact needs an email address, because invoices are sent by email.
- Roles may not repeat.

Updates use optimistic versioning: a stale `expectedVersion` returns `409` and the write is
rejected rather than silently overwriting another user's change. Archive/restore are idempotent.

## Money and accounting

CRM-001 stores no money. Billing links record *who is invoiced for which site* and whether a PO is
required; they do not create invoices, prices or accounting entries. QuickBooks mapping is M6.

## Ownership and deployment

`crm/schema.mjs` holds the additive DDL, `crm/domain.mjs` validation/authorization, `crm/service.mjs`
synchronous operations and `crm/http.mjs` transport. Startup runs a serialized checksummed
migration (`_crm_migrations`); repeat startup preserves rows, and checksum drift fails startup
rather than downgrading data, matching the Sales and platform modules.

All CRM tables live beside the existing service tables in the service database. Every write and its
audit row commit in one transaction. The module does **not** register `app.onError`: the parent
service app owns the shared error handler, and overriding it would stop other modules' errors
mapping to their proper status codes. CRM errors are converted per route instead.

Back up both SQLite databases using the existing LXC update guide. This release needs no new
environment variables. Multi-replica and PostgreSQL remain roadmap items (ARCH-005).

## UI

The customer detail page shows a **Contacts** section: every contact with role chips, inline
validation errors, add/edit form, and archive/restore. "Show archived" reveals inactive people.
Field-level rules (billing needs an email, SMS needs a phone) are surfaced from the server message
so the user sees why a save was refused.

## CRM-002: Customer 360

`GET /customers/:customerId/360` returns one read-only summary so the account screen makes a
single request instead of six. Every figure is a **live projection** of the owning module's rows;
nothing is copied into a CRM table, so the summary cannot drift from its source.

| Field | Source | Notes |
| --- | --- | --- |
| `account` | `customers` | Name, contact details, joined address, `since` (created_at). |
| `classification` | `_crm_account_settings` | Segment/type/parent; defaults when unset. |
| `counts.sites` | `sites` | All sites for the account. |
| `counts.equipment` | `assets` | Excludes `retired`. |
| `counts.openJobs` | `jobs` | Status not `completed`/`cancelled`. |
| `counts.contacts` | `_crm_contacts` | Active only. |
| `contacts` / `contactsByRole` | `_crm_contacts` | Full contact list plus billing/service shortcuts. |
| `billingLinks` | `_crm_billing_links` | Same as the billing-links endpoint. |
| `sites` | `sites` | id/name/address. |
| `equipment` | `assets` | Up to 20, ordered by site then name. |
| `recentJobs` | `jobs` | Last 10 by scheduled date. |
| `invoices` | `invoices` | `null` when the table does not exist. `billed`/`outstanding` in dollars; billed includes sent/overdue/paid; outstanding includes sent/overdue only. Draft/cancelled are excluded. Each legacy total is rounded into cents before aggregation. |
| `sales` | `_sales_opportunities` + `_sales_stages` | `null` when Sales has never run. `pipelineValue` is **integer cents**, matching the Sales API; open = stage `kind='open'`. |

Optional module tables (`invoices`, `_sales_*`) are detected rather than assumed. A database that
has never opened the invoice or Sales screens returns `null` for that section, so the screen can
distinguish "you have none" from "not installed" instead of failing the whole request.

The summary is read-only and adds no schema. It uses one deferred read transaction for a consistent snapshot of live native records, with no cross-module writes or immediate writer lock.
Unknown customers return 404; a missing session returns 401.

## Integration safeguards

The immutable original v1 migration is followed by additive v2 in
`crm/review-schema.mjs`: account classification versions and triggers preventing
CRM audit update/deletion. Upgrade tests preserve populated v1 contacts and roles.
Contact paths must match the owning customer; billing-link deletion must name an
involved account. Actor authorization is rechecked after awaiting mutation bodies.
Oversized streamed bodies return 413. Parent assignments reject arbitrary cycles.
Role audit snapshots capture the old roles before replacing the role set.

Customer detail contains Overview, Classification and billing relationships,
Contacts, and Locations & equipment; CRM is not a separate sidebar app. Client
requests use the `/api/service` prefix. Same-window CRM changes refresh the summary.
The equipment API `/api/customers/:id/assets?siteId=<uuid>&search=...` scopes count
and pagination to the selected native location. A foreign location returns 400.
