# Internal quote drafts

Standalone service-database module under `/api/sales`. This API owns immutable internal draft pricing and the
Quotes workbench. The dedicated [offer lifecycle](sales-quote-lifecycle.md) now
freezes reviewed offers and records external delivery/customer-response evidence.
Provider delivery, verified customer signatures, job conversion and procurement
remain open. A pipeline stage change is never quote acceptance.

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
- `POST /quotes`: strict `{id, requestKey, expectedVersion, document, estimate, template?}`.
  Optional `template` is null or `{id,version}`; display names are not command fields.
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
cannot change. Only draft heads may be edited. Dedicated lifecycle commands control offering and
recorded response/expiry/withdrawal; ordinary draft saving cannot change status.
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
request tables. v2 adds versioned template configuration and immutable native quote
revision/template references; v1 SQL is unchanged. See [templates](sales-quote-templates.md). Original Sales/pricing migrations are unchanged. Standard service
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

## Customer-field draft document review

Two authenticated, read-only endpoints project a selected saved revision:

- `GET /quotes/:id/document?revision=<optional positive integer>` returns `{document}`.
  Current revision is the default. `schemaVersion:1`, `kind:draft_review` and
  `identityBasis:current_native_records` explicitly distinguish this review copy
  from an offered/accepted snapshot.
- `GET /quotes/:id/document.html?revision=...` downloads a self-contained escaped
  UTF-8 HTML draft, named `Q-000001-r1-draft.html`. No scripts, external styles,
  images, forms or provider requests are included. Print CSS is included; actual
  browser printing/PDF and page-break quality are not yet qualified.

Both endpoints use the same current Owner/Admin/current-opportunity-owner policy
as internal draft reads. They are not public links, bearer capabilities or customer
portal access. Unauthenticated401, forbidden403, invalid IDs/revision400 and absent
quote/revision404 follow existing Sales contracts. Responses are private/no-store;
HTML additionally sets nosniff and a restrictive sandbox/default-src CSP.

`src/server/sales/quote-document.mjs` uses an explicit field allowlist. The result
includes title/scope/exclusions/validity, quote identifier/revision, currency/pricing
date, line descriptions/types, exact quantities/headcount, selling rates, discounts,
net/tax/total and reviewed tax treatment/rate. It never spreads a pricing object.
Unit costs, total costs, margin/profit, cost overrides, stock snapshots, profile
review notes, actor IDs and private CRM/site/equipment notes are excluded. Future
internal fields do not become public automatically.

Prices and terms come from the immutable selected revision without recalculation.
Customer name/address, location and equipment name/model/serial are a live
projection of the opportunity's current native links in the same service transaction.
Site/equipment lookups are customer-scoped. An opportunity without a linked customer remains a
prospect; a missing location is explicitly unlinked. Every copy states that identity
is current, not a frozen offered identity. Offering must later freeze those identities
and the reviewed issuer/template; this review contract cannot stand in for that.

The workbench's Document preview is available only after saving and while no edits,
save or material refresh are pending. Historical saved revisions may be reviewed.
The modal renders the allowlisted JSON through normal escaped Preact text; Download
uses the authenticated attachment endpoint and the selected revision. Both paths
remain internal review, with no acceptance, delivery, job, invoice, PO or stock effect.

Template provenance is a starting-point reference, not approval or a guarantee that
an estimate still matches its template after edits. Existing historical references
survive archival and template changes; a later quote revision may explicitly detach
the reference without rewriting earlier history. Old quote commands that omit this
optional field retain their original request hash and replay acknowledgment.
A failed retry after an uncertain response does not disprove the earlier write,
even if that retry returns403/409; both quote/template clients retain the original
command until a successful acknowledgment resolves it. Pending commands remain
in memory, not a durable offline queue.

## Internal pricing review

Quote migration v3 adds explicit company review policy and immutable pricing
approval/revocation events. No policy is seeded. `/review-policy` is Owner/Admin
only; `/quotes/:id/review` is a current-owner/admin internal read, with protected
admin mutation. See [bid review contracts](sales-bid-review.md). These controls
operate on immutable saved prices and do not change quote lifecycle status or
customer documents. Future offering must recheck current pricing qualification and
all lifecycle/identity requirements inside its own transaction.

## Supplier-pending drafts

See [pending material pricing](sales-pending-pricing.md) for nullable internal draft
prices, unlisted working items, partial subtotals and hard approval/export gates.

## Frozen offers and recorded external responses

Quote migration v4 adds the reviewed issuer, immutable offered documents and
response evidence. See [the lifecycle API](sales-quote-lifecycle.md). `/document`
remains a current-identity draft review; use `/offer-document` for the frozen
artifact. Historical draft documentation above describes the original foundation,
not a restriction that offering must remain unimplemented.
