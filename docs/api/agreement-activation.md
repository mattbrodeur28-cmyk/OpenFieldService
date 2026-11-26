# Accepted-term operational authorization and equipment scope

M5 CONTRACT-002/005 increment, 2026-11-25. Explicit operational authorization follows
recorded customer acceptance. It is not verified signatures, a legal coverage opinion,
pricing/entitlement allocation, automatic renewal, invoicing or maintenance generation.

## Accepted source and native ownership

Authorization binds one native Agreement, exact frozen Offer, retained acceptance
event/sequence, source snapshot SHA-256 and immutable PDF SHA-256. It refers to these
owning records rather than creating another editable contract/customer/equipment
master. Reusing a different accepted offer requires an explicit amendment workflow;
there is at most one retained authorization per agreement in this increment.

Owner/Admin explicitly attests review of recorded acceptance, offered PDF, proposed
term and current native location/equipment ownership. All selected locations/assets
must still belong to the accepted customer; each selected asset must still occupy
its exact accepted location, even if another location on the agreement also belongs
to the customer. Retired equipment rejects authorization. Replacement/move resolution
needs reviewed accepted scope/amendment, not silently expanded coverage. Locations
alone never imply whole-building equipment scope.

Start/end dates come from accepted source, inclusive Company dates. Authorize future
terms now as Scheduled; they become Active operational terms only on the accepted
start date. Already-ended terms reject. The Company timezone and authorization date/
instant are frozen at authorization; later Company Settings changes do not reinterpret
that term. Eligibility before the recorded authorization date is not retroactively
inferred. Within-term operational state is a read projection, not a timer that writes
new events or generates work. End dates become Term ended without read mutation.

## API

Under `/api/agreements/:id`:

- `GET /activation`: retained activation/cancellation, observed Company date/state,
  authorizationActive, immutable-source token, accepted-offer identity, readiness
  blockers and canAuthorize. Current business readers can inspect; only Owner/Admin
  writes. HR capability alone grants no write. Existing global read model remains;
  granular ownership policies are separate ARCH-017 work.
- `POST /activation/authorize`: strict `{id,requestKey,offerId,
  expectedAcceptanceSequence,expectedSnapshotHash,expectedPdfHash,reason,
  reviewAttested:true}`. UUIDs, positive exact accepted sequence, SHA-256 digests,
  reason10–2000 chars. Scope, acceptance, date and source checks run in the same
  native transaction as the immutable authorization and request acknowledgment.
- `POST /activation/cancel`: strict `{id,requestKey,activationId,
  expectedSourceToken,effectiveOn,reason,reviewAttested:true}`. One retained
  cancellation per authorization. Valid Company date today or later, no later than
  accepted end; current token and reviewed reason required. No retroactive correction,
  cancellation reversal, reactivation or renewed term is silently supplied.
- `GET /coverage?assetId=UUID&date=YYYY-MM-DD`: optional date, default current frozen
  Company date. Missing asset404. Returns exact source basis, observedAt, date,
  decision/scopeEligible and explicit unknown entitlement fields. Private/no-store.

State: not_authorized/not_authorized_yet/scheduled/active/expired/cancelled. Future
cancellation leaves earlier dates eligible and takes effect on its inclusive date.
An expired term and a cancellation remain distinguishable. Cancellation retains
accepted evidence and original authorization; it never changes native Jobs, refunds,
invoices, receipts, inventory, or external customer/provider state. Existing work and
billing need explicit review separately.

Equipment decisions additionally include outside_equipment_scope, ownership_changed,
equipment_retired and scope_eligible. A selected asset must match current native
ownership/location and not be retired. The requested date evaluates authorization
term/cancellation, while ownership remains **current native ownership**, not a
reconstruction of historical equipment moves. Response basis makes that distinction
explicit. Scope eligibility is not free service: billingEntitlement:false,
includedVisits:null,includedHours:null,responsePriority:null. Entitlement quantities,
usage/exhaustion, billable exceptions and pricing remain CONTRACT-005 work.

## Storage, recovery and UI

Additive `_agreement_draft_migrations` v5 creates immutable authorization and single
cancellation records with real native Agreement/Offer/Acceptance foreign keys. Applied
v1–v4 SQL stays unchanged. Dates/timezone/source/actor/reason remain retained; no hard
delete or mutable Active flag exists. Exact actor/key/content replay returns original
acknowledgment after current authorization; changed content/key actor, stale source,
duplicate identity or duplicate authorization/cancellation reject. Late acknowledgment
failure rolls back the new authorization/cancellation atomically. Replay is a retained
acknowledgment, not a newly evaluated live state. Back up both application databases
and private configuration consistently before upgrading.

Workbench shows accepted term, scheduled/active/cancelled state, original authorization,
future cancellation and an explainable selected-equipment check. Company timezone is
not shown by default; it remains in Settings/retained data. Decisions require explicit
review and reason. Unknown outcomes lock editing/closing/navigation while exact
in-memory retry is available. No durable offline queue or automatic conflict merging
is implied. Agreements list projects offer/response and operational term separately,
using one observation instant per page and the same owning authorization module.
Native metadata catalog declares Agreement offer/authorization identities/relations;
this does not expose generated CRUD or custom fields on those ledgers.

## Automated evidence and remaining gates

Seven new native tests cover future scheduling→active state, current ownership and
unselected assets, exact source binding, cancellation with retained accepted evidence/
Jobs, actor/content/stale and HR write boundaries, late acknowledgment rollback,
frozen timezone after Company configuration changes, pre-authorization date handling,
ended terms and streamed HTTP writer changes/private scope reads. The shared accepted-
offer fixture also retains existing lifecycle coverage without duplicated setup rules.

Remaining: browser/modal/date controls, populated v4→v5 upgrade/restore, concurrency,
real signatures/customer authority, historical ownership reconstruction, amendments,
reactivation/renewal, included visits/hours/priority and usage allocation, maintenance
plans and idempotent native work generation. Do not mark all M5 complete from an
operational Active label or scopeEligible:true.
