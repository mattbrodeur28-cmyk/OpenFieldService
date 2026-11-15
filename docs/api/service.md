# Service identity API

Standalone Node/SQLite routes under `/api/service`; active signed-in session and
completed password change required. Writes require X-Requested-With:
OpenFieldService. Identity lookup supplies only active writer IDs/names to service
and Sales; workspace auth remains authoritative for role/active/session state.

## Technician account links

GET `/technician-users` is Owner/Admin only. It returns `technicians` with
technician_id, technician_name, active, user_id (nullable), version, and eligible
`people` with id/name. Up to 500 technicians/eligible accounts; larger sets fail
422 instead of silently omitting records. No emails/passwords/session data exposed.

PUT `/technician-users/:technicianId` accepts strict JSON `{userId:UUID|null,
expectedVersion:integer}`. Only Owner/Admin may link/unlink. The technician and
selected user must be active; a user must be Owner/Admin/Member. An inactive
technician can be unlinked. HR is not service access administration. One user maps
to one technician, one technician to one user. An absent mapping has version zero;
first save is version one. Stale/duplicate links return 409. Linking does not
create a user, change an account role or imply a verified trade certification.

Mapping, version and audit commit in a single business-database transaction.
Unlinking retains the row and audit; once mapped, technician deletion is restricted
to preserve identity history. Deactivate/archive the technician instead. User IDs
reference workspace identity through validated contracts, not cross-file SQL FKs.
Do not hard-delete historical users. PostgreSQL consolidation remains ARCH-005.

GET `/my-technician` returns only the current account's mapped active technician,
or null. Viewer/inactive/temporary-password actors cannot become execution authors;
ordinary users cannot enumerate other account mappings via these endpoints.

## Job execution author contract

`service.executionActor(user, jobId, reason)` is a reusable synchronous guard for
PJSA/report/time services. Call inside the same transaction as saving
evidence. It requires an active writer, an active assigned technician, and a UUID
mapping from the actor to that technician. It returns actor user ID and assigned
technician ID. Equal names do not imply identity. Inactive/unassigned resources fail.

An Owner/Admin acting for another technician requires an explicit 10–1000 character
reason. The guard returns delegation/reason; the eventual evidence write MUST
persist both actor and technician, reason, revision and audit atomically. The guard
itself does not invent or submit a report. HR cannot delegate as a supervisor.

The old job APIs remain company-wide for existing Member accounts. Mapping is not
a least-privilege technician role or a retrofit of legacy endpoint permissions.
TECH-001 stays open until assigned-work/crew permissions and relevant UI/API scoping
are implemented. The following pilot implements PJSA/report gates; full timesheet
and billing readiness remain TECH-007/008.


## Company timezone

GET `/company` returns `{timeZone,version}` to active signed-in users. PUT is
Owner/Admin only, with strict `{timeZone,expectedVersion,reason,
acknowledgeScheduleTimes:true}`. IANA zone required; reason 10–1000 chars. Persisted
business-DB setting is authoritative. First initialization uses COMPANY_TIMEZONE,
then legacy DISPATCH_TIMEZONE, then UTC. Environment changes do not overwrite saved
company choices. The current single-company deployment uses company_id=default;
this is not tenant isolation. Future tenants need their own scoped rows/contracts.

Changes preserve scheduled wall-clock dates/times and explicitly acknowledge their
interpretation in the new zone. Validate all active assigned appointments (max
10,000) in the new zone; ambiguous/gap/invalid intervals prevent save. Audit/version
and Dispatcher SSE event commit atomically. Running processes read the DB value,
so restart is not required. Submitted actual UTC instants remain unchanged; saved
report drafts keep their original zone. Site edits preserve existing site zone;
new sites inherit the company default. No public company-page field exposes this
internal setting. HR cannot change it.

## Opt-in execution pilot

All paths below are under `/api/service`. GET `/safety-templates` lists up to 101
latest approved template revisions. POST creates an approved immutable revision
with `templateId?`, `expectedRevision`, `name`, `questions` (1–30 unique keys,
label, kind=text|ack, required) and `approvedForUse:true`. Owner/Admin only; no
production template is automatically approved. Starter UI questions require company
review. Template review is not a certification of safety/legal sufficiency.

GET `/jobs/:id/workflow` returns native job identity/equipment, companyTimeZone,
workflow, pinned template, draft, accepted safety, report drafts/revisions, current
report review, time entries and recent audit. Only mapped assigned technician or
Owner/Admin may read execution evidence. Read limits: latest 50 report revisions,
1,000 job time entries, 100 audit events; retained DB evidence is not deleted.

POST `/jobs/:id/workflow` enrolls active assigned scheduled/confirmed work with
`{templateId,templateRevision,expectedScheduleVersion}`. Owner/Admin only; existing
billing records prevent retroactive enrollment. Original schedule estimate retained.
Unenrolled legacy jobs retain their earlier behavior. Enrollment is a pilot: do not
enroll production billing work until the separate billing handoff is implemented.

PUT `/jobs/:id/safety-draft` and POST `/jobs/:id/safety-submit` take
`{expectedVersion,answers,delegationReason?}`. Required answers and types validated;
submission records immutable actor, technician, delegation, template and timestamp,
and atomically moves the original job into progress. Existing status APIs and
Dispatcher cannot bypass safety or completion gates. Accepted safety locks customer,
equipment, assignment, date and address. POST `/jobs/:id/safety-reassess` accepts
`{expectedVersion,reason}` (Owner/Admin, reason >=10 chars), retains prior evidence,
invalidates drafts and returns eligible active work to Safety. Reject a submitted
report before reassessment; completed evidence needs a future correction workflow.

## Step 2 equipment, reports and actual time

**Equipment is required before filling out Step 2.** PUT
`/jobs/:id/report-draft` and POST `/jobs/:id/report-submit` reject jobs lacking
linked equipment belonging to the same customer. SQL triggers protect direct
inserts/updates too. The UI blocks report entry with reassessment/linking guidance.
Submission retains equipment ID plus immutable name, serial, model/manufacturer,
site ID/name/address snapshot. Later catalog changes do not rewrite report evidence.
Older already-submitted reports retain their original evidence with an explicit
missing-equipment notice; no invented backfill.

Requests: `{expectedVersion,delegationReason?,lateEntryReason?,report}`. Report:
`{timeZone,workPerformed,findings,deficiencies,followUp,visitStartAt,visitEndAt,entries}`.
Entries (1–20 on submission) contain assigned `technicianId`, `startAt`, `endAt`,
`breakMinutes`, `requestedBillableMinutes`, `workType` (work/travel/nonbillable),
`notes`. Canonical ISO UTC instants are stored; explicit input offsets accepted,
minute precision required. Company-zone UI distinguishes repeated DST occurrences
and rejects nonexistent times. Visit <=24 real elapsed hours, finish <=now; labor
must lie inside visit, have positive worked minutes, no overlap, breaks <elapsed,
requested billable <=worked, and zero billable on nonbillable entries. Drafts may
be incomplete; submission cannot. Single assigned technician currently; crew/phase
entries and running timers remain open.

Actual work before the recorded PJSA requires Owner/Admin late-entry explanation
>=10 chars. This does not backdate PJSA. Submitted/approved labor overlaps across
jobs fail; rejected revisions no longer reserve the interval. New report revisions
retain previous reports, reviews and rejected ledger entries. All report/ledger/
workflow/audit writes commit together or roll back. HTTP write body max50KB.

POST `/jobs/:id/report-review` takes `{expectedVersion,reportId,decision,notes}`;
decision approved|rejected. Owner/Admin only. Approval locks evidence, marks the
native job completed and its report labor approved; payroll/timesheet approval is
separate. Rejection returns Step2 for a new revision. Approval requires equipment.
Invoice creation remains blocked pending billing readiness (stage stays review).
No report operation posts an invoice, payment or QuickBooks transaction.

Dispatcher reads approved current actual visits from these same native records.
It replaces the original estimated card without mutating the job's scheduled date,
time or duration. Actual cards are read-only and link to report evidence. Midnight
segments render on both local days. On clock-change days, exact UTC/elapsed time
is authoritative; a wall-clock distortion warning prevents equating board width
with elapsed time. Estimated/elapsed/worked/requested billable values are distinct.

## Migration and recovery

Checksummed additive `_service_execution_migrations` v1 safety, v2 report/time and
v3 required equipment. `_company_settings_migrations` v1 stores company setting and
audit. Never edit applied SQL or delete evidence tables to bypass a mismatch. Use
the existing two-database backup/update procedure, preserve private configuration,
and validate backups before upgrade. Rollback after applying new migrations requires
restoring matching pre-upgrade databases AND application revision; older binaries
intentionally refuse newer module ledgers. Local migration/tests do not qualify
Debian/LXC or Kubernetes deployment.


## Weekly timesheets

GET `/timesheets/options` returns technicians available to the actor, current company
timezone and canReview. Owner/Admin may select any retained technician (max500);
other eligible mapped writers receive only their active mapped technician. HR does
not receive access to other technicians' time through its people-administration flag.

GET `/timesheets?technicianId=UUID&weekStart=YYYY-MM-DD` requires a Monday local
calendar date. Reads native report labor, never schedule estimates. Max1,000 active
entries/week; rejected report revisions excluded. Returns UTC period boundaries,
pinned company timezone, source token, entries, totals, sheet state/version,
submissions/reviews (latest50), correction events (latest50) and submission blockers.
The daily UI groups entries by start date; overnight entries retain both instants.
Break placement/pay treatment is not inferred from a total break duration.

POST `/timesheets/submit` accepts `{technicianId,weekStart,expectedVersion,
sourceToken,delegationReason?}`. Reports must be supervisor-approved; no empty,
source-stale, already submitted/approved, cross-week or overlapping retained period
submission. Admin submission for another technician requires reason>=10chars.
Immutable snapshots pin the exact source entry IDs/data and revision. Submitted and
approved periods block additional labor insertion or ledger-state changes in SQL.
Rejected periods unlock for correction. Report labor crossing a Monday boundary must
be explicitly split with break allocation before report submission; visits can still
cross that boundary. Historical unsplit evidence requires reviewed correction.

POST `/timesheets/review` takes `{technicianId,weekStart,expectedVersion,
submissionId,decision,notes}`; Owner/Admin only, notes10–2,000chars, decision
approved|rejected. Approval checks the unchanged source token. Rejection remains
possible when source details changed. Both review and version/state commit together.
Timesheet review is distinct from job report approval, billing approval and payroll.

POST `/timesheets/reopen` accepts `{technicianId,weekStart,expectedVersion,reason,
acknowledgeExternalReview:true}`; Owner/Admin only, reason10–2,000chars. Only an
approved current version may reopen. Retains immutable previous approval/submission,
appends attributed correction event and returns the period for a new submission and
review. It does not reverse external payroll, billing or accounting exports.

GET `/timesheets/export?technicianId=UUID&weekStart=YYYY-MM-DD` downloads no-store CSV
only for currently approved periods and authorized actors. Data comes from the
approved immutable submission, including source/job/technician UUIDs, UTC interval,
worked/break/requested billable minutes and work type. Formula-like cells are escaped.
Later job renaming does not rewrite the exported historical snapshot. Export is not
payroll calculation, payment instruction or transmission to an accounting provider.

Checked additive `_service_timesheet_migrations` v1 periods/submissions/reviews/SQL
locks, v2 retained correction events. Never edit applied SQL. Use matched application
and database backups for rollback. Wage/overtime rules, paid/unpaid break policy,
crew/phase identity, non-job labor and payroll-provider qualification remain open.


## On-Demand billing preparation

GET `/jobs/:id/billing` is Owner/Admin only. Returns original job/report identity,
approved labor candidates, same-job material usage/cost, source token, blockers and
saved draft/version/stale flag. Requires completed supervisor-approved report with
retained matching equipment and On-Demand category. Quoted/PM/Unclassified work is
blocked until accepted scope, agreement coverage and entitlement rules exist.

PUT `/jobs/:id/billing-draft` accepts strict `{expectedVersion,sourceToken,
currency:"USD",labor,materials,taxBasisPoints,notes}`. Each labor/material source ID
must appear exactly once. Labor entries contain sourceId, integer hourly rateCents,
integer billableMinutes and reason; materials contain sourceId, integer selling
rateCents and reason. Material quantities come from source usage (positive, <=3
fractional digits); selling prices never default to unit cost. Labor billing cannot
exceed worked minutes; nonbillable work stays zero. Changing requested billable
minutes, zero hourly rate or no-charge material requires explanation>=10characters.
Max20 labor/200 material sources, rate<=10million cents, total<=$10million USD.

Amounts use integer/BigInt arithmetic: labor cents rounded half-up per source from
minutes*hourlyCents/60, materials from milliQuantity*unitCents/1000, then a single
subtotal tax rounding at taxBasisPoints/10,000. Tax rate is explicitly reviewed input,
not a taxability determination. The UI takes decimal USD values and converts them
without floating-point money calculations. Saved totals refer to the saved draft.

A source hash covers current job/category/equipment/report/labor/material usage and
cost/name context. Stale source/version, duplicate/unknown sources and invalid
quantities fail without changes. Draft and attributed before/after audit commit
atomically. `_service_billing_migrations` v1 creates drafts/audit additively.

This is preparation, not approved billing or invoice readiness. Execution stays at
billing review; no invoice, payment or QuickBooks posting occurs. Final material/RMS
checks, accepted quote/PM coverage and idempotent invoice handoff remain TECH-008.


## Native inventory

All routes are below `/api/service`, authenticated and no-store. Writes require the
standard same-origin write header; bodies are bounded to 50KB, parsed strictly, then
current roles rechecked. Viewer/inactive/password-change accounts cannot operate.

GET `/inventory` returns available locations, managed material IDs and management
capability. GET `/inventory/locations/:id?page=1` returns balances, rounded company
unit cost in cents, custody and 100 movement rows plus `hasMoreHistory`. Quantities
are integer milliunits, values decimal strings of integer millicents. Max 500
locations and 1,000 items/location in this pilot; larger scopes fail explicitly.
GET `/jobs/:id/inventory` returns tracked usage/returned amounts/version (max 200).

POST `/inventory/locations` accepts `{id?,expectedVersion,name,code,kind,technicianId,
active,reason}`. Owner/Admin only; kind warehouse/truck; warehouse cannot have custody.
Version 0 creates. Transfer all stock before deactivation/type change. PUT
`/inventory/policy` accepts `{locationId,materialId,expectedVersion,reorderMilli,reason}`.

POST `/inventory/movements/:kind` uses an actor-bound UUID `requestKey`, reason >=10
characters, quantity integer 1..1e9 milliunits and optimistic source/destination
versions. Unknown fields fail. Supported kinds:

- `receipt`: materialId, locationId, quantityMilli, unitCostCents, expectedVersion,
  opening (default false). Owner/Admin; opening must match original catalog stock.
- `transfer`: materialId, fromLocationId, toLocationId, quantityMilli,
  expectedFromVersion, expectedToVersion. Two distinct active accessible locations.
- `usage`: materialId, locationId, quantityMilli, expectedVersion, jobId,
  delegationReason (supervisor only; otherwise assigned mapped technician).
- `return`: jobMaterialId, toLocationId, quantityMilli, expectedUsageVersion,
  expectedToVersion, delegationReason. Cannot exceed original less returned quantity.
- `adjustment`: materialId, locationId, countedMilli, expectedVersion, unitCostCents,
  approved:true. Owner/Admin; variance uses current average for losses/reviewed cost
  for gains. No-variance counts are not recorded in this pilot.
- `reversal`: movementId. Owner/Admin; original opening/receipt/transfer/count only,
  no subsequent same-material company movement or affected balance/policy changes.
  Usage corrections use returns; billing corrections cannot bypass finalization.

Receipt/count costs are nonnegative integer cents <=1e8. Reasons max1,000 characters.
Quantities use at most 3 decimals through client conversion. Each movement freezes
before/after quantity/value snapshots and company valuation evidence. All balance,
ledger, native usage and value reallocation writes share one synchronous transaction.
A replay with identical actor/body returns original movement/jobMaterialId; changed
payload conflicts, revoked custody still denies access. Do not retry an uncertain
mutation with a fresh request key. UI retains the original attempted payload/key.

Company average includes every warehouse/truck. Repricing another location increments
its version and can invalidate an open form. Returns restore original issue cost;
new purchases do not reprice historical job usage. Per-location history shows stock
legs; immutable `_inventory_valuations` also retains repricing of other locations.
Stock is not reserved; negative availability fails atomically. PO/AP/payment posting,
vehicle tracking, offline writes and complete count sessions are not implemented.
