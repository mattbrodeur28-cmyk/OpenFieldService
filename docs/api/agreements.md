# Native agreement drafts

M5 CONTRACT-001/002 foundation, 2026-11-25. Backend and draft workbench source. No
acceptance, activation, job generation, provider communication or qualified release
is claimed.
Tests, type checks, builds, browser and populated migration qualification are deferred.

## Native ownership

Agreement drafts refer to native Customer, Site and Equipment UUIDs. They do not
create copies of those operational records. The draft customer UUID is fixed after
creation; use a new reviewed draft for a different customer. Locations must belong
to that customer and each selected asset must belong to the same customer and one
of the selected locations. These checks run again inside every save transaction.
Equipment moves may require explicitly reviewing and adjusting a later draft version;
previous revisions remain unchanged. Historical references prevent hard deletion of
referenced native rows; do not disable foreign keys to remove retained history.

Scope, exclusions, terms, optional dates, document reference and proposed price are
versioned draft content. `documentReference` is an internal textual reference, not
proof of an uploaded authoritative document or legal acceptance. Price is nullable
unknown or exact nonnegative USD cents; zero and unknown remain distinct. Frequency
fixed/monthly/quarterly/annual describes proposed pricing only. It neither posts
revenue nor creates invoice schedules. This foundation makes no tax calculation.

Renewal policy is manual_review or no_renewal; there is no automatic renewal option.
Selected locations are a draft scope anchor, never implicit whole-building entitlement.
Equipment warranty dates, dates reached, saved pricing or a document reference never
activate coverage. Lifecycle acceptance/activation, amendments, entitlements, verified
authoritative documents, maintenance plans and work generation remain CONTRACT-002–008.

## API and permissions

Base `/api/agreements`, session authenticated, private/no-store. Active Owner/Admin/
Member/Viewer read access follows the current global business-record read model.
Only Owner/Admin may save or archive drafts. HR capability alone grants no agreement
write access. Centralized owner/team/field visibility is still ARCH-017, not supplied
by a native FK. Writes require workspace CSRF header and recheck the actor after
awaited bounded JSON;100KB streamed request limit.

- `GET /?page=1&search=&customerId=&includeArchived=false`:25 heads/page and total.
  Omit customerId when not filtering. Literal case-insensitive title/customer-name
  search≤200 characters; no SQL wildcard interpretation. Current customer label is
  live. Status draft/archived_draft and coverageEnforced:false are explicit.
- `GET /:id`: current native draft head/document and live customer identity.
- `GET /:id/history?page=1`:25 immutable draft revisions/page plus hasMore, actor,
  reason, recorded time and exact document JSON.
- `POST /`: strict full reviewed command:
  `{id,requestKey,expectedVersion,customerId,title,scope,exclusions,terms,
  documentReference,startsOn,endsOn,renewalPolicy,priceCents,currency,
  billingFrequency,siteIds,assetIds,archived,reason}`.

UUID ID/key/customer/locations/assets; initial expectedVersion0, then exact current
version. Title1–200, scope≤12000, exclusions≤8000, terms≤12000, reference≤1000;
valid YYYY-MM-DD dates or empty, end not before start when both present. Price null
or safe integer0–10,000,000,000, currency USD. Up to100 unique locations and500 unique
assets, no automatic equipment expansion. Reason10–2000. Archive creates a retained
version; restore also creates one. There is no hard-delete or active-status command.
AGR sequence numbers are assigned atomically and not reused after archiving.

## Storage and command recovery

Separate domain, repository and HTTP adapters; SQL remains inside the repository.
Additive checksummed `_agreement_draft_migrations` v1 creates native heads,
immutable revisions, revision-scoped location/asset foreign keys and immutable request
acknowledgments. Local preview startup applied v1 after a consistent two-database backup; this is
not populated-migration or workflow qualification. Back up both app
databases and private configuration before startup/updating; never edit applied SQL.

Native validation, head/version, document revision, coverage references and request
acknowledgment commit in one synchronous transaction. Version conflict409; different
content under the same request key409; another actor/key403. Same actor/exact command
recovers its original result after current authorization. The result explicitly says
communicationSent:false,coverageActivated:false,workGenerated:false. A retained
acknowledgment does not imply that the draft is the latest current version.

## Remaining qualification and work

Qualify the draft workbench, native selection/search, reviewed history and uncertain
command recovery UI. Add separate lifecycle and authoritative document workflows before introducing active coverage or recurring jobs. Before release cover
native foreign-key ownership, asset moves, duplicate scope, missing references,
nullable/zero price, dates, archive/restore, stale/concurrent writes, exact actor-bound
retries, late failure rollback, history immutability, migration/restore and read/write
roles. No draft agreement was created while writing this source.


## Draft workbench (source, unqualified)

Field Service → Agreements (`/agreements`, `/agreements/:id`) lists 25 draft heads
per page, literal title/customer search and optional archived records. Owners/Admins
create/edit/archive drafts; current ordinary business readers can inspect scope and
history. There is no Active toggle or automatic-renewal action.

Native pickers use `GET /options?kind=customer|site|asset&page=1&search=`; site/asset
lookups require customerId. Each response is25 rows plus hasMore, no total inferred.
Search is bounded literal name matching; equipment also searches serial number.
The repository uses a fixed SQL allowlist, never client table/column names. Existing
scope labels are returned in draft detail from native rows. Selection is retained
by UUID across search pages and can be reviewed/removed separately. Removing a
location does not silently remove equipment: saving requires reviewing the dependent
selection to satisfy native ownership rules. Changing customer on a new draft asks
before clearing existing scope. Saved drafts cannot reassign customer identity.

The workbench records proposed dates/terms, nullable exact USD price, frequency,
manual/no renewal and a review reason. Blank price stays unknown; zero remains zero.
History pages show exact retained document revisions, actor/reason/time. Original
revision JSON remains distinct from current native display labels. The UI labels
location selection as draft scope, not whole-building entitlement or legal coverage.

Writes use guarded exact in-memory retry. Inputs freeze on uncertain outcomes and
close/navigation remains guarded. Successful acknowledgment returns the native draft
ID; the detail screen reloads current persisted scope after navigation. There is no
durable offline queue, auto-merge, acceptance evidence upload or customer delivery.
Native role checks, version/foreign-key validation and transaction rollback stay
server-side. No sample contracts, scope mutations or runtime requests were made for
this work. Keyboard/mobile, paged selections, stale writes, retry, snapshot readback,
backup/migration and build/test qualification remain deferred.


## Exact-revision internal review (source, unqualified)

Additive `_agreement_draft_migrations` v2 records immutable internal decisions against
a particular retained draft revision. V1 SQL remains unchanged. V2 has not been loaded
into the local preview yet. This workflow does not offer a contract to a customer,
record customer acceptance, activate entitlements or generate maintenance work.

`POST /:id/review` requires Owner/Admin and strict `{id,requestKey,expectedVersion,
expectedReviewSequence,action,reason,reviewAttested:true}`. UUID event/key, current
positive draft version, current nonnegative per-revision review sequence, reason
10–2000. Actions and allowed prior state:

- submit: not_submitted/rejected/withdrawn → submitted;
- approve: submitted → approved;
- reject: submitted → rejected;
- withdraw: submitted/approved → withdrawn.

Archived drafts cannot be reviewed. Submit/approve require proposed scope, terms,
start/end dates, known price (including explicit zero), at least one location, and
current native scope ownership. An internal document reference does not become
verified authoritative evidence by passing this gate. The acting reviewer may also
be the draft author under the current Owner/Admin policy; independent two-person
approval is not supplied or implied. Every actor and reason remains retained.

Submission snapshots exact document revision plus current native customer and scope
labels and hashes that context with SHA-256. Approval requires the same source hash;
a changed native context requires withdrawing and resubmitting. Rejection/withdrawal
remain available to record the issue without pretending the old context is current.
Detail exposes current revision review status/sequence/hash and `sourceChanged`.
A new draft revision begins not_submitted, including archive/restore; historical
approvals never silently transfer. Later offer/acceptance gates must bind this exact
reviewed context and separately verify authoritative documents and customer authority.

`GET /:id/review-history?page=1` returns25 retained decisions/page plus hasMore,
revision/sequence/action/status, actor/reason/time and exact context/hash. No deletion
or retroactive rewrite API exists. Review event, sequence, snapshot and actor-bound
request acknowledgment commit together. Exact retries recover prior results after
current authorization; stale source/version/sequence and changed request reuse reject.

The draft workbench exposes submit/approve/return/withdraw according to current state,
explicit review attestation, retained decisions and guarded uncertain retries. It
separates internal approval from customer acceptance in its labels. Typed registry
now declares `agreements.draft` with native Customer ownership; it does not declare
active contracts, generated CRUD or custom-field support on agreements.

Before release qualify all transitions, new revision after approval, archive/restore,
changed native labels/ownership, duplicate/stale submissions, event collisions,
actor-bound retry, rollback after review write, read/write roles and nested modal
behavior. Testing/build/browser and production qualification remain deferred. No
review decisions were submitted while implementing this source.

Automated checks have now resumed: six agreement tests and the complete196-test
suite pass; TypeScript and build pass. See [qualification progress](../releases/2026-11-25-automated-progress.md)
for exact coverage and remaining HTTP/populated-migration/browser gates. Earlier
source-only notes above describe the state when those increments were written.

## Proposed contract PDF follow-up

[Revision-bound proposed PDFs](agreement-documents.md) now retain one immutable
original per draft revision and bind its metadata/hash into internal review context.
The workbench supports upload and current/historical downloads. A textual reference
still is not a retained PDF or acceptance evidence. Full offer/customer acceptance,
active coverage and authoritative accepted-version lifecycle remain open.

## Offer/customer-response follow-up

The [frozen offer/evidence lifecycle](agreement-lifecycle.md) now binds reviewed
issuer, PDF, recipient, exact approved revision and external response evidence.
It protects open/accepted scope and explicitly separates recorded acceptance from
verified signatures, activation, amendments, entitlement and generated maintenance.

## Operational authorization follow-up

[Accepted-term authorization](agreement-activation.md) now binds exact accepted
source/PDF, validates native ownership, freezes Company timezone and projects future/
active/ended/cancelled terms. Scope eligibility remains distinct from included labor/
visits, billable exceptions, pricing and generated maintenance work.

## Renewal follow-up

[Agreement renewals](agreement-renewal.md) now create a linked renewal draft from an
authorized agreement (new term dates and repricing) and retain the source relationship
and history; the draft then uses the normal offer/accept/authorize lifecycle. Assigned
renewal tasks and reminders remain open.

## Profitability follow-up

[Agreement profitability](agreement-entitlement.md) now projects the authorized
contract value (a contract value, not recognized revenue), net native material cost
(usage minus return movements) on in-scope jobs during the active term, and a per-job
allocation. Labor cost remains explicit null until a reviewed labor cost-rate policy is
configured; margin is contract value minus material cost with that unknown labeled.

## Amendment follow-up

[Agreement amendments](agreement-lifecycle.md) now create a linked amendment draft from
an accepted agreement with deliberate scope/price/terms overrides, retained in an
immutable `_agreement_amendments` ledger (v10); the draft then uses the normal review/
offer/accept/authorize lifecycle. Accepted scope is never silently rewritten.

## Authoritative document follow-up

[Authoritative documents](agreement-documents.md) now bind the exact accepted offer's
immutable PDF (and acceptance event) as the authoritative contract document for an
agreement (v11), retained immutably. One authoritative document per agreement; amendments
and renewals create new drafts with their own lifecycle.
