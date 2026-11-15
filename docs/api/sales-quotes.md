# Internal quote drafts

Standalone service-database module under `/api/sales`. This increment persists
internal quote drafts; the Sales Quotes workbench pilot is implemented with browser qualification still incomplete. There is no offering,
customer document, customer acceptance, delivery, job conversion, or procurement
allocation command yet. A pipeline stage change is not quote acceptance.

## Access and native records

Owner/Admin can read/write draft quotes. An active Member can read/write only
quotes whose opportunity they currently own. Viewer has no internal pricing access;
HR adds no power. Recheck current actor after awaited HTTP bodies. Standard Sales
session, temporary-password, CSRF header, and 50KB streamed-body limits apply.
These quote-specific read permissions are narrower than legacy Sales list access.

The head references the native opportunity. Revision material lines reference native
catalog IDs with foreign keys. No customer/site/asset/job/material copy, stock
movement, invoice, PO, or acceptance is created. A saved draft may belong to a
prospect without a linked customer; customer/site requirements must be resolved by
the future offering/conversion commands.

## Endpoints

- `GET /quotes?page=1&opportunityId=<optional UUID>`: 25 authorized quote summaries
  plus total/page/pageSize. Invalid page or unauthorized explicit opportunity fails.
- `GET /quotes/:id?revision=<optional positive integer>&historyPage=1`: current head,
  selected saved revision (current by default), up to 25 revision metadata rows,
  historyPage and hasMoreHistory. Unknown quote/revision404. Head version and selected
  revision are distinct, so opening history does not masquerade as the editable head.
- `POST /quotes`: strict `{id, requestKey, expectedVersion, document, estimate}`.
  UUID IDs/keys; new draft version0, update current version. Document requires
  title1–200, scope1–12000, exclusions0–10000, validUntil real ISO date at least the
  estimate pricingDate. Estimate uses the exact preview contract in
  [Sales pricing](sales-pricing.md), including current opportunity/profile versions,
  native material snapshots and cost override reasons. Returns `{quote}`.

Save returns the exact calculation, full reviewed profile/version, material evidence,
input lines and terms. Calculation `persisted:true`, `kind:internal_draft` means an
internal draft snapshot, not an offered customer document. Costs and review notes
are private and must be omitted from future customer-facing representations.

Each successful save increments the draft version and appends an attributed,
immutable revision and native material line references. The head's opportunity
cannot change. Only draft heads may be edited. No status-change endpoint exists.
Identifiers Q-000001 etc. use transactionally allocated unique sequence numbers;
a failed save does not consume a number.

## Atomicity, replay and history

One synchronous service-database transaction resolves current opportunity ownership,
validates current pricing, captures material costs, saves head/revision/lines, and
persists the actor-bound request acknowledgment. Pricing exposes an internal
`previewInTransaction` contract for this caller; HTTP preview wraps that same logic
in its own transaction. Never nest transactions or hold them across awaits.

Retry the exact command with its original requestKey after an uncertain response.
Identical actor/content returns the original saved result even if newer revisions
exist. Changed content409; another actor403; lost current ownership403. A stale
expectedVersion/profile/opportunity409 cannot overwrite history. Immutable triggers
reject revision/line/acknowledgment update/delete. A failed journal insert rolls back
all writes. No external messages, orders, or payments are sent.

Additive checksummed `_sales_quote_migrations` v1 creates the head/revision/line and
request tables. Original Sales/pricing migrations are unchanged. Standard service
SQLite online backups cover these records; restore a consistent matching backup
for recovery. PostgreSQL, multi-replica, provider, and customer-portal qualification
remain separate roadmap work.

## Workbench lookups

`GET /quotes/options?kind=opportunities&search=&page=1` returns up to 25 open
opportunities the actor may estimate (current owner for Members, all for admins),
with native id/title/version/segment/customerName plus total/page/pageSize.
`kind=materials` requires a native `opportunityId` the actor currently owns or may
administer. It returns up to 25 native inventory cost snapshots, total/page/pageSize,
and accepts an optional exact UUID `materialId` for deliberate single-line cost
refresh. No cost fallback to the legacy catalog price is introduced. Viewer403;
invalid pages/kinds/IDs400; unauthorized opportunity403. These are read contracts,
not stock movements or approvals. Lookups run in one service transaction.

Billing profile list additionally accepts bounded name/state/jurisdiction search
and optional `segment=commercial|residential`. `GET /billing-profiles/:id` returns
the current profile to active Sales writers, retaining requiresReview. Picking an
old saved revision does not silently adopt a newer tax rule version.

Workbench routes: `/sales/quotes`, `/sales/quotes/new`, `/sales/quotes/:quoteId`.
Calculation and saving remain server-owned. Browser fields convert decimals to
integer cents/milli quantities without truncation or exponent coercion. A price
review is invalidated when inputs change; failed/uncertain saves retain the exact
command in memory for retry. No client-only success, customer acceptance or stock
reservation is inferred. Pending edits are not a durable offline draft store.
