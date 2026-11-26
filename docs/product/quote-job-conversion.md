# Accepted quote → native Job conversion (work in progress)

Status: source implementation in progress, 2026-11-25. Testing explicitly deferred
by the owner. This is not a qualified release, a live migration or deployment.
Do not infer completion of SALES-008/009 from these notes.

## Source implementation

Sales owns immutable conversion identity and references the already-frozen offer,
its retained acceptance event and the original Opportunity. Service owns the native
Job creation capability and a restrictive contract/location relationship to that
Job. There is no copied Customer, equipment, shadow Job or Sales-only schedule.
Native Dispatcher triggers project the Job and the native work category is quoted.

An active Owner/Admin explicitly chooses an existing customer and location,
optionally equipment and a service type, a planning date, estimated slot length,
priority, mapping attestation/note and Won reason. Frozen native links and any
existing Opportunity links cannot silently be replaced. A prospect must be resolved
to an existing customer deliberately; the original frozen prospect document stays
unchanged. Missing equipment can be resolved later through the explicit execution
context workflow; Step 2 still requires equipment. The service contract retains the initially offered equipment link. A previously
unknown job asset can be bound once to equipment at the retained customer location;
replacing an already-bound asset requires a later explicit change workflow. This
source guard and its execution-context interaction still need qualification.

The planning date is not a confirmed appointment: technician is null, time is empty,
and work appears in the all-date unassigned pipeline. Duration is explicitly an
estimated elapsed slot, not a sum of multiple people's estimated labor hours.

One caller-owned synchronous database transaction checks current quote, lifecycle
sequence and Opportunity versions, verifies the exact accepted JSON/HTML hashes,
creates the native Job with native numbering, retains the conversion, then marks
the original Opportunity Won using its configured transition/required fields.
Unique quote/offer/acceptance/Opportunity/Job references prevent duplicate work.
An actor-bound request journal returns the original acknowledgment on an exact
retry, after rechecking current authorization. A different key after conversion
returns a conflict pointing at the existing job; it never creates another Job.

Cancellation is an explicit admin command with current Dispatcher version and a
reason, limited to scheduled/confirmed work. It preserves the quote's acceptance,
Won history, conversion and cancelled Job; it does not reopen or create a replacement.
No customer message is sent. Active/completed corrections remain a separate workflow.

Accepted total is retained in exact integer cents in the shared service contract;
native job.price remains a compatibility dollar projection. The old invoice shortcut
adds used materials to job.price, which could double bill a quoted job. Source now
blocks that shortcut with HTTP 409 and database invoice-link guards. Correct accepted
scope/progress invoicing remains open. Stock use remains an actual cost, not an
additional quoted customer charge. No PO, reservation, invoice, payment or external
communication is created by conversion.

## API source contract

Under `/api/sales/quotes/:id`:

- `GET /conversion`: current conversion, competing Opportunity conversion where
  present, readiness/versions, native link hints/labels, accepted customer-field
  scope/price, scheduling version, cancellation blocker and retained history.
- `GET /conversion/options?kind=customers|sites|assets|serviceTypes&search=&page=1`:
  Owner/Admin, 25 rows/page/hasMore; sites require customerId; equipment requires
  customerId and siteId. Each read rechecks source quote ownership.
- `GET /api/sales/converted-jobs/:jobId`: reverse Job→conversion link after current
  Sales permission checks; no internal cost/profile/pricing-review data is returned.
- `POST /conversion`: strict `{id,requestKey,jobId,offerId,acceptanceEventId,
  expectedQuoteVersion,expectedEventSequence,expectedOpportunityVersion,
  customerId,siteId,assetId,serviceTypeId,planningDate,durationMinutes,priority,
  mappingAttested:true,mappingNote,wonReason}`. UUID identities; nullable asset/type;
  duration 15–1440 minutes; priority low/normal/high/urgent; both notes 10–2000 chars.
- `POST /conversion/cancel`: `{id,requestKey,expectedScheduleVersion,note}`.

Current Sales authorization, CSRF, body limit and private/no-store responses apply.
Conversion readiness does not replace command-time transactional validation.

## Persistence and rollout

Additive quote migration v5 creates conversion, request and cancellation-event
records with immutable update/delete guards. Service has a separate checksummed
`_service_job_handoff_migrations` ledger for native Job contract/location and invoice
safety guards. Existing applied migration SQL is not edited. Backup service and
workspace databases consistently before any future upgrade. Old code rejects a
newer ledger; rollback requires matching application/database backups.

## Review screens

The Quote workbench has a Job / Work Order handoff panel. Owner/Admin converts
only the current accepted revision with no unsaved quote changes. Review the frozen
scope/price and original offered identity next to the explicit native mapping.
Customers, locations, equipment and service types use bounded server search, 25
results/page. Locations are scoped to customer; equipment to customer and location.
Existing offered/opportunity links are locked. An equipment-less conversion retains
its site and still requires equipment before Step 2. Estimated slot is explicitly
15–1440 minutes and no technician/time is invented.

Converted work shows links to the original Job, Dispatcher and Opportunity. If a
different accepted quote already converted this Opportunity, the panel links to that
existing quote/Job instead of creating another billable record. Job detail links back
to the accepted quote and Opportunity, subject to current Sales ownership permission.
A technician's access to field Job data does not grant internal Sales cost access.

Cancellation review records a reason and current scheduling version. The panel
shows a blocker for active/closed work or retained safety/report/time evidence.
Retained cancellation history stays visible. No new conversion is offered afterward.
Conversion dialogs use the same in-memory exact-command recovery/navigation guards
as offers; unknown outcomes lock edits and require retrying the original command.

## Deferred qualification and remaining implementation

- Qualify the native equipment binding guard and complete explicit replacement/
  change-order workflows; the source mapping/link/cancellation UI above is untested.
- Add meaningful transaction rollback, native projection, stale version, permission,
  exact replay, concurrent/different-key duplicate, cancellation and billing tests.
- Populated migration preservation and restrictive foreign-key checks.
- Run type checking, build and regressions only when testing resumes; old tests that
  explicitly assert quote migration v4 will need a reviewed v5 expectation.
- Browser pointer/keyboard mapping, conversion/readback, refresh and cancellation.
- Verify one accepted source produces one native Job and cannot double bill materials.
- No LXC, provider, customer-message, signature, distributed database or Kubernetes
  qualification is claimed.

## Automated handoff checkpoint

The fresh-fixture accepted quote → native Job → Won flow, Dispatcher board readback,
exact retry, duplicate/stale/unauthorized rejection, native invoice shortcut guard,
late rollback and retained cancellation now pass in the228-test suite. See
[qualification evidence](../releases/2026-11-25-automated-progress.md). Actual pointer
assignment/reload, concurrent workers, populated upgrade/restore, all evidence
cancellation variants, accepted-scope billing and external customer/provider proof
remain separate gates. These tests do not mark SALES-008/009 or M4 complete.
