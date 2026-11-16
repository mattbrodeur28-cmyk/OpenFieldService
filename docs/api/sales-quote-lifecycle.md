# Quote issuer and offer lifecycle

All routes are under `/api/sales`. Active current Owner/Admin or opportunity-owning
Member is required for quote operations. HR has no extra power; Viewer cannot
access internal quote documents. Issuer administration and response/withdrawal
recording are Owner/Admin only. HTTP rechecks the current actor after awaiting a
body. Standard CSRF header and 50KB streamed body limit apply. All new reads and
commands return `Cache-Control: private, no-store`.

## Issuer

`GET /quote-issuer?page=1` returns current issuer or null, immutable configuration
history (25 rows), page and hasMore. `POST /quote-issuer` accepts strict
`{requestKey,expectedVersion,config}`. Config is
`{schemaVersion:1,legalName,address,email,phone,terms,reviewNote}`: trimmed nonempty
name ≤200, address ≤1000, valid email ≤254, optional-content phone ≤80, terms
1–6000 and internal note 10–2000 characters. No implicit default issuer exists.
A new head uses expectedVersion0; later saves increment the version. Exact retries
are actor-bound and immutable; changed content/stale version409, other actor403.
Public document projection explicitly omits the internal review note and actor.

## Lifecycle read and command

`GET /quotes/:id/lifecycle?revision=&page=1` returns selected revision, current
headVersion/quoteStatus, global per-quote eventSequence, computed state, companyDate,
totalCents/validUntil, frozen offer metadata/document if present, readiness,
selected-revision history (25), page and hasMore. Readiness supplies current
opportunityVersion, public issuer fields/version, policyVersion, reviewSequence,
suggested recipient and blockers. These are review hints, not authorization tokens.

`POST /quotes/:id/lifecycle` accepts a strict discriminated command. Every action
requires `{id,requestKey,expectedQuoteVersion,expectedEventSequence,action,note}`.
IDs/keys are UUIDs, quote version is a positive integer, event sequence is a
nonnegative integer and note is trimmed 10–2000 characters. Unknown fields fail400.

| Action | Additional fields | Preconditions / result |
| --- | --- | --- |
| `offer` | expectedOpportunityVersion (native nonnegative version), expectedIssuerVersion, expectedPolicyVersion, expectedReviewSequence, recipient `{name,email}` | Current complete draft, open opportunity, exact current versions, qualified pricing, valid company dates and current active/effective matching billing profile. Freeze document/HTML/issuer/native identity/pricing control and set offered. Event ID is also the new offer ID. |
| `delivered` | offerId, occurredAt, evidenceReference, attested:true, method email/hand_delivery/portal/other | Current live offered revision. Record evidence without sending communication; status stays offered. |
| `accepted` / `declined` | offerId, occurredAt, evidenceReference, attested:true, respondent `{name,email}`, capacity | Admin, current live offered revision and prior delivery of this exact offer; response time cannot precede the latest recorded delivery. Set accepted/declined and lock further response writes. |
| `expire` | offerId | Current offered revision and company date later than validUntil; persist expired. |
| `withdraw` | offerId | Admin, current offered revision; persist void. No customer notification. |
| `revise` | offerId | Current unaccepted offered/declined/expired/void revision. Append copied draft revision/lines/template links, set draft, retain superseded old offer. Accepted revisions cannot be reopened. |

Evidence times are ISO UTC instants, not later than the server clock or earlier
than the offer. References are trimmed 10–2000 characters, names 1–200, email valid
≤254, capacity 3–200. Evidence is an explicit staff attestation, not a fetched
attachment or provider/signer verification. Events bind stored JSON and HTML hashes.
Event time must fall within validity, and current company date must still be valid
for delivery/responses. Company timezone is read from the existing service company
settings; UTC is only the isolated-service fallback. Reads do not write expiry.

Each write holds one synchronous service transaction through native relationship
checks, immutable document/event writes, status change and acknowledgment. Stale
quote/event/issuer/policy/review/opportunity409. Current authorization is checked
before journal replay; an exact actor/content retry returns the original result,
including after later transitions. A failed journal insert rolls back the entire
operation. No await or nested transaction is held inside this boundary.

## Frozen artifacts

`GET /quotes/:id/offer-document?revision=` returns
`{offerId,documentHash,htmlHash,document}`. `GET /quotes/:id/offer-document.html`
returns the stored HTML bytes with an attachment filename, nosniff, and sandbox /
default-src-none CSP. Missing offer for that revision404, forbidden403. These are
authenticated internal downloads, not public recipient links.

The document adds `kind:offered`, `identityBasis:frozen_offer`, allowlisted issuer
fields, recipient and offeredAt to the customer-field draft projection. Costs,
margins, stock snapshots, private CRM notes and issuer review notes are excluded.
SHA-256 JSON and HTML hashes are retained. HTML is generated once with escaped
text and no scripts/remotes/forms; subsequent renderer changes do not replace it.
Existing `/document` and `/document.html` remain clearly labeled draft review with
current native identity. They must not be used as the offered artifact.

## Persistence, recovery and limits

Additive quote migration v4 creates versioned issuer head/revisions/requests,
offers, lifecycle events and request acknowledgments. Applied v1/v2/v3 SQL is
unchanged. Offer native customer/site/asset IDs retain restrictive foreign keys;
quote/version uniqueness prevents issuing the same revision twice. Immutable
triggers reject UPDATE/DELETE on snapshots, events, config revisions and journals.
Native opportunity/head records remain authoritative; no parallel CRM or job exists.

Back up both service and workspace SQLite files consistently before upgrading.
A populated v3 upgrade test checks unchanged source rows, pending null prices,
pricing approvals/templates/provenance/replay, empty issuer/offers and FK integrity.
Old code rejects the newer migration ledger: rollback requires restoring the
matching pre-upgrade database and application backups. Distributed PostgreSQL /
multi-replica and external provider qualification remain open.

Acceptance does not create a Job or mark Won. That future conversion command must
bind the actually accepted offer/event and create native shared records atomically,
with unique conversion identity and replay safety. PDF, external email delivery,
verified signatures/evidence attachments and public customer access are not supplied
by this lifecycle module.
