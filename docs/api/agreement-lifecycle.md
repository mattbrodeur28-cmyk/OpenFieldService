# Frozen agreement offers and attributed customer-response records

M5 CONTRACT-002/007 increment, 2026-11-25. This is an internal offer/evidence workflow,
not verified customer signatures, provider delivery, active entitlements or generated
work. Actual authority and supplied evidence require business review. No legal
conclusion about enforceability follows from storing a response.

## Ownership and frozen source

Agreements owns its immutable offer/evidence records. Native Customer, Site, Equipment
and draft revision identities are retained. The reviewed business issuer remains
owned by the existing Sales issuer module: Agreements receives only its synchronous
public-field capability (version/legal name/address/email/phone/terms), with no copied
editable issuer settings or internal review notes. Configure it in Settings. Native
registry declares Agreements' dependency on Sales; issuer revision FK keeps provenance.

Offering requires an unarchived exact current internally approved revision, unchanged
review source/sequence, known proposed price and scope already validated by review,
and one retained proposed PDF. Admin explicitly reviews the PDF against structured
scope/price/terms/issuer/recipient/expiry; no OCR or automated PDF equality claim is
made. Offer snapshot freezes document/scope/native labels, exact PDF identity/hash,
review ID/sequence, issuer public revision, recipient and valid-through date. SHA-256
binds its canonical stored JSON; original PDF bytes are independently immutable.
Later native label or issuer edits do not rewrite the offered snapshot.

One offer per draft revision. Withdrawal/decline/expiry retain it; a replacement uses
a new draft revision and fresh PDF/review. Open offers block draft and review edits.
Recorded acceptance blocks ordinary draft edits and appends; direct native draft-head
updates/revision inserts are also guarded. Amendments are a separate future workflow,
not a silent revision of accepted scope. Lifecycle list status is separate from draft
status; Acceptance recorded never means Active.

## API and roles

Base `/api/agreements/:id/lifecycle`. Current active Owner/Admin writes, current
ordinary business readers read according to the existing global record model. HR
capability alone grants no write. Session/role rechecked after awaited bounded JSON;
CSRF required; private/no-store. No unauthenticated customer portal is created.

- `GET /`: readiness/current-revision review source and issuer, proposed PDF,
  current-revision offer or null, canOffer/blockers and current Company date.
- `GET /history?page=1`:25 retained offer/evidence events across revisions/page and
  hasMore. Reasons, actor, recorded time and exact evidence remain retained.
- `POST /offer`: `{id,requestKey,expectedVersion,expectedReviewSequence,
  expectedIssuerVersion,expectedSourceHash,validUntil,recipient:{name,email},reason,
  reviewAttested:true}`. UUID event/offer and request key; positive draft/issuer
  revisions, nonnegative review sequence, exact SHA-256, valid YYYY-MM-DD not earlier
  than Company date, recipient name1–200/email≤254, reason10–2000. No message is sent.
- `POST /response`: common `{id,requestKey,offerId,expectedSequence,action,reason}`.
  Exact positive current sequence and an offer belonging to the agreement required.
  Actions below have strict distinct schemas; unknown fields reject.

Delivery action `delivered` additionally needs `{occurredAt,evidenceReference,
attested:true,method}`; method email/in_person/external_portal/other. Record evidence
of delivery performed elsewhere. The app does not email, upload to a portal or verify
provider receipt. Delivery can be recorded once, while state is Offered.

Customer response `accepted` or `declined` requires prior recorded delivery and
`{occurredAt,evidenceReference,attested:true,respondent:{name,email},capacity,
authorityReference}`. Evidence/authority references10–2000 chars, capacity1–200.
Respondent may differ from delivery recipient, but explicit reviewed authority is
mandatory. Timestamps normalize explicit ISO offsets, cannot predate offer/prior
retained event or be in the future. Evidence is staff-attested; stored signature
verification remains false. Response may be recorded only before the current
Company-date offer deadline. Late evidence needs a separate reviewed exception policy;
this workflow never backdates or silently extends an expired offer.

`withdrawn` has only common fields, for Offered/Delivery recorded. `expired` has only
common fields and requires current Company date strictly after validUntil. Reads do
not mutate expiry. Accepted/declined/withdrawn/expired are closed; evidence corrections
and accepted amendments need explicit later workflows, not overwrite commands.

Every write returns communicationSent:false,coverageActivated:false,workGenerated:false.
An accepted response returns customerAccepted:true with customerAcceptanceVerified:false;
this means attributed acceptance evidence was recorded, not identity/signature proof.
No Job, invoice, revenue, automatic renewal or customer entitlement is generated.

## Transactions and recovery

Additive `_agreement_draft_migrations` v4 creates immutable offer/event rows and
accepted-draft guards; v1–v3 SQL remains unchanged. Offer/event/snapshot/request
acknowledgment share one synchronous native transaction. Source/review/issuer/sequence
conflicts reject before writing. Actor/content-bound exact retries return original
acknowledgments after current authorization, even when the offer is now closed.
A new request key cannot duplicate a revision offer. Identity collisions reject.
Late acknowledgment failures roll back offer/response events, preserving approved
source. Back up both application databases and private configuration before upgrades.

## Workbench and remaining gates

Agreement detail shows readiness, issuer, exact offered PDF, hashes, recipient,
expiry, internal review and separate lifecycle status. Privileged forms explicitly
attest exact source/evidence and retain reasons. External event entry uses Company
Settings time without displaying the zone by default. Unknown outcome freezes form
edits and guards closing/navigation while exact in-memory retry remains available.
No durable offline queue or automatic conflict merge is supplied. Draft/review controls
are disabled under an open or accepted offer and server checks remain authoritative.

Seven focused lifecycle tests pass: frozen issuer/PDF/source and no side effects,
explicit delivery/authority before acceptance, accepted edit guards, role/stale/issuer/
source and actor/content replay, Company-date expiry without read mutation, offer/
response late rollback, retained withdrawal/new revision, private/CSRF HTTP and writer
revocation during streamed JSON. Browser forms, DST ambiguous event entry, populated
v3→v4 migration/restore, worker concurrency, evidence corrections, verified signature/
provider delivery, accepted amendments, activation/entitlements and work generation
remain open. Do not mark M5 complete from recorded acceptance.

## Amendments

CONTRACT-002, 2026-11-26. `POST /api/agreements/:id/amendment` (Owner/Admin) creates a
linked amendment draft from an accepted agreement with optional title/scope/exclusions/
terms/document-reference/site/asset/price overrides and a `kind` label, then flows
through the normal review/offer/accept/authorize lifecycle. `GET
/api/agreements/:id/amendments` returns the immutable source relationship and history.
The accepted source scope stays protected; an amendment is a new reviewed version, not a
silent overwrite. Verified signatures and provider delivery remain CONTRACT-007.
