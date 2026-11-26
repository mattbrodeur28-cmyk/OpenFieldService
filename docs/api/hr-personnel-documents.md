# Person-linked private personnel documents

2026-11-25 working source, unpublished. Testing and browser qualification remain deferred.

## Ownership and navigation

Personnel files attach to `_hr_staff.id`. Native technicians use that same UUID;
there is no separate editable personnel identity. Open **Personnel documents** in
an existing HR → Staff profile, or **Documents** beside a technician on the Field
Service Technicians list. Save a new staff member before adding documents. The HR
Documents tab is removed; its old route renders Staff for bookmark compatibility.

Active Owners/Admins and Members with HR capability may list, upload, edit metadata,
archive/restore, download and inspect history. Every API operation checks current
people-management permission, including after awaited request bodies. Ordinary
technicians cannot read files merely because they concern them. HR membership does
not grant service-document, billing, integration or credential access.

Physical content shares the immutable `_document_blobs` storage/deduplication layer
with ticket documents. HR metadata, associations, request acknowledgments and audit
history are separate. Uploading the same content always creates its own HR document
record. Ticket-document IDs and links never grant access to HR records; HR IDs are
not registered as ticket documents. Deliberately uploading identical content to a
job ticket remains a separate, explicit disclosure governed by that workflow.

## API

Base `/api/hr-documents`, session authentication, private/no-store, workspace CSRF
header for mutations. IDs and request keys are UUIDs.

- `GET /staff/:id?page=1&includeArchived=false`: 25 documents/page, person identity,
  total and metadata. Optional archived records are retained, not deleted.
- `POST /staff/:id/upload`: multipart with exactly one `file` and JSON `metadata`.
  Metadata: `{id,requestKey,title,category,expiresOn,reason}`. Supported file signatures
  PDF/PNG/JPEG/WebP, nonempty up to 10 MiB; filename is sanitized, not used as a path.
  Signature identification is not full parsing or malware scanning.
- `POST /records/:id`: strict JSON `{requestKey,expectedVersion,title,category,
  expiresOn,archived,reason}`. Current version required; no person reassignment,
  original replacement or hard deletion.
- `GET /records/:id/history?page=1`: 25 retained events/page and `hasMore`.
- `GET /records/:id/download`: authorized original bytes as attachment, nosniff,
  private/no-store and sandbox CSP. Downloads do not imply a malware verdict.

Title 1–160 characters; category employment/certification/training/license/other;
expiry empty or valid calendar date; reason 10–2000 characters. Audit records actor,
reason and before/after metadata; original bytes and creation identity stay immutable.
Expiry is metadata only: no automated reminders, legal validity or acknowledgment.

## Transactions, recovery and limits

Additive checksummed `_hr_personnel_document_migrations` v1 follows Staff and blob
initialization. Upload metadata/blob/audit/request acknowledgment commit atomically.
Metadata edits use optimistic versions. Same actor, request key and exact content
recover the original response after current authorization; changed content conflicts,
another actor is forbidden. Upload fingerprints bind person, bytes, filename and all
validated metadata. Failed transactions leave no partial new document association.

The UI retains the exact pending command/File in memory, locks uncertain edits and
blocks closing/navigation until recovered. This is not a durable upload queue;
closing the browser loses in-memory recovery. Back up both application databases and
private configuration consistently; do not remove migration ledgers to bypass errors.
Archive retains original bytes and history. Configurable retention/purge, legal holds,
malware scanning, expiry reminders, acknowledgment workflows, object storage and
technician self-service access require separate work.

Before release qualify authorization across HR/service roles and inactive accounts,
populated migrations, original/download byte equality, file boundaries, path-safe
filenames, duplicate content isolation, concurrent edit/version failures, archive,
actor-bound exact retries and late failure rollback. UI keyboard, nested modal and
mobile behavior remain unqualified. No broad tests/build/browser QA were run here.

Automated qualification resumed after this source increment. The HR/personnel and
platform follow-up now contributes thirteen focused tests to a209/209 passing suite.
See [exact coverage and remaining gates](../releases/2026-11-25-automated-progress.md).
Browser, populated upgrade/restore and deployment qualification remain separate.
