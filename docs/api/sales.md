# Sales opportunities and pipelines

This is the first M4 Sales increment (SALES-001/002/003). It runs entirely in the
standalone Node/SQLite deployment. It does not require Clawnify or provider keys.
Quotes, customer acceptance and conversion into active jobs are subsequent work.

## Permissions and scope

One company workspace: all signed-in roles may read Sales, consistent with current
customer-record access. Members (including HR) create opportunities owned by
themselves and change/note their own opportunities. Owners/Admins may assign and
change any opportunity, configure pipelines and reopen Lost work. HR adds no Sales
administration privileges. Viewers cannot mutate. Active owners are local Owner,
Admin or Member accounts; owner lookups expose only IDs/names. Disabled historical
owners remain in stored records. An administrator must reassign their opportunities
before ordinary editing resumes.

Private owner/team visibility policies are not implemented; do not use this slice
for Sales records requiring isolation from other authenticated company users.
Internal notes are never emailed or published. Activity snapshots contain business
contact information and belong in private database backups under the company's
retention/access policy. Enterprise audit retention/export/redaction remains M2.

## API

Every route below is under `/api/sales`. Sessions must be active and temporary
password changes completed. Mutations require `X-Requested-With: OpenFieldService`.
Handlers recheck the current user after awaiting the request body.

| Method/path | Contract |
| --- | --- |
| GET `/pipelines` | Pipelines with id/name/version and ordered active stages; currency USD. |
| POST `/pipelines` | Owner/Admin: name and stages. Returns pipeline, 201. |
| PUT `/pipelines/:id` | Same fields plus expectedVersion. Returns pipeline. |
| GET `/options` | Active owner IDs/names; up to 100 customers matching `search`; optional customerId returns up to 100 sites/equipment for that customer. |
| GET `/opportunities` | Required pipelineId; optional ownerId/search/status=open,all,lost/closeFrom/closeTo/minValue/maxValue/page. Returns pipelineId, opportunities, total/page/pageSize, per-stage totals and currency. |
| GET `/opportunities/:id` | Opportunity, latest 100 audit events and latest 100 internal notes. |
| POST `/opportunities` | Full opportunity fields below. Returns opportunity, 201. |
| PUT `/opportunities/:id` | Full fields plus expectedVersion. Stage/pipeline remain fixed; use the stage endpoint. |
| PUT `/opportunities/:id/stage` | stageId, expectedVersion, optional reason. Returns opportunity. |
| POST `/opportunities/:id/notes` | content (1–8,000 characters), expectedVersion. Returns updated opportunity, 201. |

Opportunity input: title, pipelineId, stageId, ownerId, prospectName, contactName,
contactEmail, contactPhone, segment (commercial/residential), source, expectedValue,
probability, expectedCloseDate, nextAction, nextActionDate, customerId, siteId,
assetId, notes. References are UUID or null; absent optional strings are explicitly
empty. Choose a linked customer or enter a prospect name. Dates are valid YYYY-MM-DD
or empty. Response business fields use snake_case and include version/labels.
Request schemas reject unknown fields. Read the source schema before extending it.

Pipeline input: name, stages (3–20); updates add expectedVersion. Each stage has id
(optional on creation), name, kind (open/won/lost), probability, requiredFields and
allowedFrom. Stages require unique names/IDs, at least one open stage, exactly one
Won (100%) and one Lost (0%). At most 20 pipelines. Removed unused stages are
archived internally; occupied stages cannot be removed or change business meaning.
Creation seeds a default Service Sales pipeline with configuration only, no prospects.

`requiredFields` supports customerId, expectedCloseDate, expectedValue (positive)
and nextAction. `allowedFrom` contains other stage IDs in the same pipeline;
empty allows any prior stage. Requirements are enforced on entry and editing.
Stage moves set the opportunity probability to that stage's default. Ordinary
editing may use a specific probability for that opportunity. Pipeline probability
changes do not retroactively alter existing estimates.

Lost requires a reason of at least three characters. Editing closed opportunities
is blocked. Reopening Lost requires Owner/Admin plus reason and preserves the audit.
Won is reserved and rejected until accepted quote conversion is implemented; dragging
there never marks a sale won or silently creates a job. No quote/revenue is invented.

Customer/site/equipment relationships are checked inside the write transaction.
Linked CRM rows cannot be hard-deleted while referenced by Sales. Generic foreign
key conflicts return 409 rather than an opaque server failure.

Invalid input returns 400; missing session 401; permission denial 403; missing
record 404; stale or invalid stage transition 409. On 409, re-fetch and review;
do not automatically replay a write. Failed writes leave both business rows and
audit unchanged. Members cannot transfer their own records to another user.

## Money, filters and display

This release uses USD only. Expected values are integer cents from 0 through
1,000,000,000 ($10,000,000). API value filters also use integer cents. The browser
accepts decimal USD and converts it exactly; no fractional-cent pricing is stored.
Pipeline value sums matching expectedValue; weighted forecast sums value × probability
÷ 100 and rounds only for currency display. These estimates are not earned revenue,
invoices, payments or accounting entries. Recognition/QuickBooks rules are later work.

Lists paginate 50 opportunities per page, newest update first with stable ID tie-
breaking. Stage counts/value totals cover all matching records, not merely the
visible page. Search is bounded to 200 characters across title, prospect/customer,
contact name and next action. Date/value ranges are inclusive; undated work is
excluded when a close-date filter is present. Filters apply to totals and cards.
Large-company performance and multi-currency aggregation remain unqualified.

The browser polls opportunities/pipeline definitions every ten seconds and refreshes
on focus/reconnect. Polling pauses during a drag. Proposed stage highlighting is
immediate; the server persists the move on drop. Lost/reopen drops open a reason
form. Failure refreshes the board and retains the saved stage. Open a card for the
keyboard stage form or use the semantic list alternative. Offline/failed-board
states disable mutations; no Sales data is added to the field offline cache.

## Ownership and deployment

`domain.mjs` owns validation/authorization helpers, `service.mjs` synchronous Sales
operations and SQL queries, `storage.mjs` the additive schema/audit helper, and
`http.mjs` transport. `platform/sqlite.mjs` owns reusable synchronous transactions
and checksummed module migrations. Full repository interfaces/PostgreSQL are still
M2 work; this is not a claim that the legacy app has been refactored.

Sales tables live beside existing service tables in the service database. Startup
runs a serialized checksummed migration; repeat startup preserves rows. Checksum
drift and a newer unknown module schema fail startup rather than downgrade data.
Every Sales write and audit commit together with expected-version checks. Account
names/active state come from the identity service; no cross-database transaction
or multi-process identity guarantee is claimed.

Back up both SQLite databases and private configuration using the existing LXC
update guide. This release needs no new environment variables or provider secrets.
Use one application instance with persistent local storage. Multi-replica Kubernetes,
PostgreSQL, queues, audit retention and tenant isolation remain roadmap items.
Rollback after production writes requires maintenance and a verified matching
backup; do not delete Sales tables to make a checksum mismatch disappear.

## Follow-ups and native customer context

GET `/activities?opportunityId=&assignee=me/all/USER_ID&status=open/done/cancelled/all&page=1`
returns 50 records ordered by due time, total/page/pageSize and server `now`. Optional
`dueBefore` is an offset-bearing timestamp. GET `/activities/reminders` returns up
to 50 of the current user's open reminders due, plus the full count. UI refreshes
reminders each minute/on focus; there is no email/SMS/push/background delivery.

POST `/opportunities/:id/activities` and PUT
`/opportunities/:id/activities/:activityId` accept strict JSON: `kind`
(call/meeting/site_survey/task), `title`, `details`, `assigneeId`, `dueAt`,
`reminderAt`, `status` (open/done/cancelled), `outcome`, `messageId` (UUID or null).
Creation requires `expectedOpportunityVersion`; update requires `expectedVersion`
for the activity. Reminder must be no later than due time. Timestamps must include
an offset and are stored as canonical UTC. Completion/cancellation requires a
three-character outcome/reason. Completion retains actor/time; reopening clears
current completion fields but preserves prior audit. No hard-delete endpoint.

Owner/Admin can assign active writers. Members can create for their own opportunity,
assign themselves, and edit their own/assigned activities; HR adds no Sales powers.
An existing other assignee may be retained. Each save increments the opportunity
version and commits activity, opportunity history and audit atomically. Stale
versions return 409; close/reopen to review instead of replaying blindly.

A newly linked message must be readable through collaboration permissions. Only
team/message IDs are stored; message text is not projected into Sales. Changing
team membership changes message read access, not historical Sales evidence. Links
open the team's existing screen; only its recent 100 messages are available there.

GET `/customers/:id/context?page=1` joins the original customer to 25 opportunities
across pipelines and the count of open follow-ups. Customer detail consumes this
projection; `/sales/:opportunityId` opens the original opportunity. No customer copy
is created. Company-wide Sales read visibility still applies.

## Estimate pricing foundation

Reviewed billing profiles in Settings and exact server-side estimate preview are
implemented separately: [pricing contracts](sales-pricing.md). Preview is not a
saved quote, customer offer/acceptance, invoice, conversion or stock reservation.

## Current-stage timing (unqualified source, 2026-11-25)

Opportunity list/detail now project `stageTiming` over the owning audit; see
[CRM pipeline progress](../product/crm-pipeline-progress.md) for field definitions,
unknown/review states and deferred coverage. No migration, extra stage ledger or
change to transition permissions. Current-page age is not a full forecast/cohort
report or proof of a completed M4.

## Loss, nurture and outcome history

SALES-010, 2026-11-26. Moving an opportunity to a Lost stage requires a reason of at
least three characters and may carry an optional `competitor` (≤200) and `nurtureDueAt`.
The transition appends an immutable `_sales_stage_outcomes` row (v3) retaining kind
(`won`/`lost`/`reopen`), stage, reason, competitor, actor and time; a `nurtureDueAt`
also creates a native nurture task for the opportunity owner. Reopening lost work
requires an administrator and a reason and appends a `reopen` outcome. Converted Wins
append a `won` outcome from the accepted-quote handoff. Prior quote versions stay
retained by the frozen offer lifecycle; no quote is overwritten. `GET
/opportunities/:id/outcomes` returns the history newest-first; rows are immutable.

## Forecast and conversion metrics

SALES-011, 2026-11-26. `GET /forecast` (optionally `?pipelineId=`) returns one row per
active stage with count, unweighted value (integer cents), weighted value (expected
value × opportunity probability, rounded), plus open/won/lost rollups, a quote
acceptance ratio (accepted ÷ offered lifecycle events) and a native conversion count
from `_sales_quote_conversions`. Definitions are returned alongside the figures; quotes
and pipeline value are never counted as recognized revenue. Historical stage-duration
and cohort metrics remain a separate follow-on.
