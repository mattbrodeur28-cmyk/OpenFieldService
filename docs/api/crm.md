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

## Prospect conversion source follow-through

Unqualified 2026-11-25 source adds the CRM-owned transactional native customer/site/
contact handoff used by [Sales prospect conversion](sales-prospect-conversion.md).
Public contact writes and handoff share the same internal contact operation. No
second customer master is introduced and no customer communication is sent.
Testing and populated migration qualification remain deferred.


## Customer 360 Sales composition follow-up (source, unqualified)

Standalone Sales registers `salesCustomerOverviewInTransaction`, an owning-module
read capability. CRM receives a deferred callback, so native service initialization
can precede Sales initialization. Customer360 invokes it inside its existing native
read snapshot. It creates no customer, opportunity, activity, quote or summary row.
Compatibility callers without the capability retain the existing aggregate-only
projection; missing modules remain distinguishable from empty collections.

`sales` retains openOpportunities/pipelineValue/currency and adds:

- `observedAt`: UTC observation instant used for overdue counting.
- `activities`: up to ten native activity metadata rows, total/open/overdue counts,
  limit10. Open activities first, then due instant and ID. Overdue means strictly
  before observedAt while open; no reminder delivery is inferred. Rows include title,
  kind, status, assignee ID, due/reminder/completed instants and native opportunity
  identity/title. No team-message bodies/IDs, note bodies or external mail is exposed.
- `proposals`: up to ten latest native quote heads, total, limit10 and explicit
  `relationship:current_opportunity_customer`. IDs, Q-number, current revision/status,
  updated time and opportunity identity/title only. No draft pricing JSON, internal
  revision body or frozen offer document is embedded. These are quotes reached through
  currently linked opportunities; frozen offers retain their historical customer
  context and must be reviewed in their own workflow.

All counts cover native records linked by the current opportunity customer UUID.
They do not match names/emails, infer unconverted prospects, or treat a different
billing party as the account owner. The summary uses existing authenticated Sales
read visibility; no narrower owner policy or broadened team-content access is added.
Centralized granular visibility remains ARCH-017.

Customer UI shows bounded follow-ups and proposal links, empty vs unavailable and
explicit truncation. Activity due times use Company Settings timezone without a
visible zone label; if unavailable the UI says so rather than choosing a device zone.
This is an internal operational view, not customer-facing communication, accepted
contract coverage, full historical timeline or recognized revenue.

No migrations or source-record mutations are required. Backend restart is required
to load the new projection into a running preview. Tests/build/browser/runtime
qualification are deferred: cover absent-capability fallback, empty/large datasets,
counts/order, current customer reassignment vs frozen offer context, Company timezone,
role boundaries, native links and snapshot consistency before release.

## CRM-004: customer activities (tasks, follow-ups and notes)

Additive `_crm_migrations` v3, 2026-11-26. Customer-scoped activity records with a
`private` vs `customer_visible` boundary, assignees, due/reminder instants and retained
completion outcomes. These commands record internal or customer-facing activity; they
do not send email/SMS, post to a customer portal or write team messages.

- `GET /customers/:customerId/activities?page=&status=&visibility=&kind=` — up to 50
  rows/page, total, ordered by due date then created time. Status/visibility/kind
  filters are literal and default to all.
- `POST /customers/:customerId/activities` — create (201). `PUT .../:id` — update with
  `expectedVersion`. Strict command: `{kind:note|task|follow_up,visibility:private|
  customer_visible,title,details,assigneeId,dueAt,reminderAt,status:open|done,outcome,
  expectedVersion}`. Title1–200, details≤8000, outcome≤4000, reminder at or before due.
  Notes have no assignee/due/reminder and are recorded done; tasks and follow-ups need
  an assignee and due date. Completing to `done` requires a ≥3-char outcome and stamps
  `completedBy`/`completedAt` once.
- `GET /activities/reminders` — the signed-in user's open activities whose reminder is
  now due, newest first.

Writes are Owner/Admin/Member (Viewers read), assignee must be an active writer, and
every create/update is audited in one transaction (a late audit failure rolls the
activity back). Replay and cross-account scoping follow the existing CRM contact rules.

Remaining: activity attachments, customer-facing delivery (CRM-007), reminder delivery
worker, per-user record visibility (ARCH-017) and browser workbench qualification.

## CRM-006: duplicate candidates (first slice)

2026-11-26. `GET /customers/duplicates` returns read-only candidate groups of two or
more accounts sharing a normalized email (trimmed/lowercased), phone (digits only) or
name (lowercased, diacritics and punctuation stripped). It never merges, deletes or
rewrites records; a reviewed merge policy and validated import/export remain separate
follow-on work with explicit PII controls.

## CRM-006: PII-controlled export

2026-11-26. `GET /customers/export?format=json|csv` is Owner/Admin-only and returns a
live read of native customer rows plus classification and contacts (never a copied
ledger). CSV fields are escaped and served as an attachment. Import preview and the
reviewed duplicate-merge policy remain separate follow-on work.

## CRM-007: communication log and consent

2026-11-26. `GET/POST /customers/:customerId/communications` records staff-attested
mail/call/SMS/portal activity against a customer and optional contact, with channel,
direction, subject, summary and an external reference. Outbound records enforce the
contact's email/phone/SMS consent; inbound records (customer-initiated) are allowed.
This logs activity performed elsewhere — it does not send mail/SMS or read provider
mailboxes; automatic provider mail/channel linking and delivery remain separate.

## CRM-004: activity attachments

2026-11-26. `GET/POST /customers/:customerId/activities/:activityId/attachments` links an
already-uploaded private document to a customer activity (v5 ledger, soft document
reference validated at link time). Upload stays in the shared document module; the link
is immutable and audited. Direct upload from the activity screen remains separate work.
